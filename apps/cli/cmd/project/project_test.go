package project

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	cmdauth "github.com/raizora/radas/v4/cmd/auth"
	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/config"
)

// newProjectRoot builds a bare root command wired like production: shared
// persistent runtime flags plus the project command group.
func newProjectRoot() *cobra.Command {
	root := &cobra.Command{Use: "radas"}
	config.RegisterPersistentFlags(root)
	root.AddCommand(Cmd)
	resetParsedFlags(Cmd)
	return root
}

func newProjectsServer(t *testing.T, listCalls *int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/projects" || r.Method != http.MethodGet {
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "not found"})
			return
		}
		if listCalls != nil {
			*listCalls++
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"projects": []map[string]any{
				{"id": "proj-alpha", "name": "Alpha", "orgId": "org-1"},
				{"id": "proj-beta", "name": "Beta", "orgId": "org-1"},
			},
		})
	}))
}

func TestProjectListDoesNotPersistSelection(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")

	var listCalls int
	srv := newProjectsServer(t, &listCalls)
	defer srv.Close()

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "--token", "test-token-list", "project", "list"})
	if err := root.Execute(); err != nil {
		t.Fatalf("project list: %v", err)
	}

	if listCalls != 1 {
		t.Errorf("server received %d GET /api/projects calls, want 1", listCalls)
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("LoadSelector: %v", err)
	}
	if sel.ProjectID != "" {
		t.Errorf("project list persisted selection %q; list must be read-only", sel.ProjectID)
	}
}

func TestProjectUsePersistsSelectedID(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "test-token-use")

	var listCalls int
	srv := newProjectsServer(t, &listCalls)
	defer srv.Close()

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "project", "use", "proj-alpha"})
	if err := root.Execute(); err != nil {
		t.Fatalf("project use: %v", err)
	}

	if listCalls != 1 {
		t.Errorf("server received %d GET /api/projects calls, want 1 (use must validate against the server)", listCalls)
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("LoadSelector: %v", err)
	}
	if sel.ProjectID != "proj-alpha" {
		t.Errorf("selector ProjectID = %q, want proj-alpha", sel.ProjectID)
	}

	data, err := os.ReadFile(filepath.Join(dir, config.SelectorFileName))
	if err != nil {
		t.Fatalf("read selector file: %v", err)
	}
	if strings.Contains(string(data), "test-token-use") {
		t.Fatal("token value leaked into selector file")
	}
}

func TestProjectUseUnknownIDFailsWithoutPersisting(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")

	// Pre-seed an existing selection to prove a failed use keeps it intact.
	if err := config.SaveSelector(config.Selector{ProjectID: "proj-alpha"}); err != nil {
		t.Fatalf("SaveSelector: %v", err)
	}

	var listCalls int
	srv := newProjectsServer(t, &listCalls)
	defer srv.Close()

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "project", "use", "proj-missing"})
	if err := root.Execute(); err == nil {
		t.Fatal("expected error for unknown project id, got nil")
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("LoadSelector: %v", err)
	}
	if sel.ProjectID != "proj-alpha" {
		t.Errorf("selector ProjectID = %q, want proj-alpha (failed use must not clobber selection)", sel.ProjectID)
	}
}

func TestProjectUseHonorsOrgFlag(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")

	srv := newProjectsServer(t, nil)
	defer srv.Close()

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "--org-id", "org-flag", "project", "use", "proj-beta"})
	if err := root.Execute(); err != nil {
		t.Fatalf("project use: %v", err)
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("LoadSelector: %v", err)
	}
	if sel.ProjectID != "proj-beta" || sel.OrganizationID != "org-flag" {
		t.Errorf("selector = %+v, want project proj-beta with org org-flag", sel)
	}
}

// authRecorder returns a server that records the Authorization header of the
// GET /api/projects call and answers with the standard two-project payload.
func authRecorder(t *testing.T, gotAuth *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/projects" || r.Method != http.MethodGet {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		*gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success":  true,
			"projects": []map[string]any{{"id": "proj-alpha", "name": "Alpha", "orgId": "org-1"}},
		})
	}))
}

// The adapter must authenticate from the credentials stored by
// `radas auth login` when no --token/RADAS_TOKEN override is present.
func TestProjectListAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, &gotAuth)
	defer srv.Close()

	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
	if err := cliauth.NewStoreAt(dir).Save(cliauth.Credentials{
		APIURL:      srv.URL,
		AccessToken: "stored-access-token",
		Username:    "alice",
	}); err != nil {
		t.Fatalf("seed stored credentials: %v", err)
	}

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "project", "list"})
	if err := root.Execute(); err != nil {
		t.Fatalf("project list with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestProjectWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	}))
	defer srv.Close()

	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "project", "list"})
	err := root.Execute()
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestProjectStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	}))
	defer srv.Close()

	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
	if err := cliauth.NewStoreAt(dir).Save(cliauth.Credentials{
		APIURL:      srv.URL,
		AccessToken: "stored-access-token",
		Username:    "alice",
	}); err != nil {
		t.Fatalf("seed stored credentials: %v", err)
	}

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "project", "list"})
	err := root.Execute()
	if !errors.Is(err, cmdauth.ErrStoredSessionRejected) {
		t.Fatalf("error = %v, want cmdauth.ErrStoredSessionRejected", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// The --token flag (the CI path) must win over stored credentials: the stored
// credentials point at a server the test never starts, so if the adapter used
// them the request would never reach the flow server.
func TestProjectListTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, &gotAuth)
	defer srv.Close()

	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
	if err := cliauth.NewStoreAt(dir).Save(cliauth.Credentials{
		APIURL:      "http://not-the-test-server.invalid",
		AccessToken: "stored-access-token",
		Username:    "alice",
	}); err != nil {
		t.Fatalf("seed stored credentials: %v", err)
	}

	root := newProjectRoot()
	root.SetArgs([]string{"--api-url", srv.URL, "--token", "ci-override-token", "project", "list"})
	if err := root.Execute(); err != nil {
		t.Fatalf("project list with token override: %v", err)
	}
	if gotAuth != "Bearer ci-override-token" {
		t.Errorf("Authorization = %q, want bearer token from --token flag", gotAuth)
	}
}

// resetParsedFlags walks the shared command graph and restores every flag an
// earlier test parsed: cobra merges root persistent flags into each child
// command's flag set during execution, so parsed values (and their *Flag
// pointers) stick to the package-level command vars across tests. Without
// this reset, a stale --token/--api-url parsed by a previous test would win
// over the current test's environment and stored credentials.
func resetParsedFlags(c *cobra.Command) {
	c.Flags().VisitAll(func(f *pflag.Flag) {
		if f.Changed {
			_ = f.Value.Set(f.DefValue)
			f.Changed = false
		}
	})
	for _, sub := range c.Commands() {
		resetParsedFlags(sub)
	}
}
