package project

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
)

// newProjectRoot builds a bare root command wired like production: shared
// persistent runtime flags plus the project command group.
func newProjectRoot() *cobra.Command {
	root := &cobra.Command{Use: "radas"}
	config.RegisterPersistentFlags(root)
	root.AddCommand(Cmd)
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
