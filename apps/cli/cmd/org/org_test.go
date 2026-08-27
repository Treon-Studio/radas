package org

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
)

// runOrg executes an org subcommand with the runtime configuration pointed at
// srvURL ("" keeps the built-in default) and returns the combined cobra and
// stdout output together with the command error.
func runOrg(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = w

	var buf strings.Builder
	Cmd.SetOut(&buf)
	Cmd.SetErr(&buf)
	Cmd.SetArgs(args)
	cmdErr := Cmd.Execute()

	os.Stdout = old
	_ = w.Close()
	captured, _ := io.ReadAll(r)

	return buf.String() + string(captured), cmdErr
}

func statusServer(t *testing.T, code int, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_, _ = w.Write([]byte(body))
	}))
}

func TestOrgListSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/orgs" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"orgs": []map[string]any{{
				"id": "org-1", "slug": "primary-org", "name": "Primary Org",
				"role": "admin", "is_current": true,
			}},
		})
	}))
	defer srv.Close()

	out, err := runOrg(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("org list: %v", err)
	}
	if !strings.Contains(out, "Primary Org") {
		t.Errorf("org row missing from output:\n%s", out)
	}
}

func TestOrgListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runOrg(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"org-global", "org-sandbox", "Sandbox Team"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: static fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestOrgListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"orgs": []}`)
	defer srv.Close()

	out, err := runOrg(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("org list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No organizations found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
	if strings.Contains(out, "org-global") {
		t.Errorf("static fallback rows printed on empty response:\n%s", out)
	}
}

// TestOrgSwitchPersistsLocalSelectorWithoutServer proves org switch is an
// honest local operation: it persists the CLI selector and never fakes a
// remote mutation (no server is contacted at all).
func TestOrgSwitchPersistsLocalSelectorWithoutServer(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runOrg(t, srv.URL, "switch", "org-sandbox")
	if err != nil {
		t.Fatalf("org switch: %v", err)
	}
	if hits != 0 {
		t.Errorf("org switch must be a local selector operation, but the server was hit %d time(s)", hits)
	}
	if !strings.Contains(out, "org-sandbox") || !strings.Contains(out, "selector") {
		t.Errorf("switch output must state the local selector change:\n%s", out)
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("load selector: %v", err)
	}
	if sel.OrganizationID != "org-sandbox" {
		t.Errorf("selector organization = %q, want org-sandbox", sel.OrganizationID)
	}
}

// TestOrgRulesUnimplementedIsExplicitError proves the rules commands never
// print fabricated policy state: the control plane has no org rules API, so
// the commands fail explicitly and never call mutating endpoints.
func TestOrgRulesUnimplementedIsExplicitError(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runOrg(t, srv.URL, "rules", "org-global")
	if err == nil {
		t.Fatal("org rules must fail explicitly; the control plane has no rules API")
	}
	if strings.Contains(out, "Enforcement Mode") || strings.Contains(out, "Mandatory Tags") {
		t.Errorf("fabricated rules output printed:\n%s", out)
	}

	out, err = runOrg(t, srv.URL, "rules", "set-rules", "org-global", "--require-tags", "env,team")
	if err == nil {
		t.Fatal("org set-rules must fail explicitly; the control plane has no rules API")
	}
	if strings.Contains(out, "✔") || strings.Contains(out, "rules updated") {
		t.Errorf("fabricated set-rules success printed:\n%s", out)
	}

	if hits != 0 {
		t.Errorf("rules commands called the server %d time(s); unwired mutations must not invent calls", hits)
	}
}

// TestOrgListUsesCentralRuntimeConfig proves the org command factory no
// longer resolves RADAS_API_URL/RADAS_TOKEN on its own: the request must be
// driven end to end by the shared LoadRuntimeConfig path, including the
// --api-url/--token/--org-id flags and their environment fallbacks.
func TestOrgListUsesCentralRuntimeConfig(t *testing.T) {
	var (
		gotPath string
		gotAuth string
		gotOrg  string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotOrg = r.Header.Get("X-Org-Id")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"orgs": []map[string]any{{
				"id":         "org-1",
				"slug":       "primary-org",
				"name":       "Primary Org",
				"role":       "admin",
				"is_current": true,
			}},
		})
	}))
	defer srv.Close()

	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")

	root := &cobra.Command{Use: "radas"}
	config.RegisterPersistentFlags(root)
	root.AddCommand(Cmd)
	root.SetArgs([]string{
		"--api-url", srv.URL,
		"--token", "test-token-org",
		"--org-id", "org-flag",
		"org", "list",
	})

	var out strings.Builder
	root.SetOut(&out)
	root.SetErr(&out)

	if err := root.Execute(); err != nil {
		t.Fatalf("org list: %v", err)
	}

	if gotPath != "/api/orgs" {
		t.Errorf("request path = %q, want /api/orgs (factory ignored --api-url?)", gotPath)
	}
	if gotAuth != "Bearer test-token-org" {
		t.Errorf("Authorization header = %q, want bearer token from --token flag", gotAuth)
	}
	if gotOrg != "org-flag" {
		t.Errorf("X-Org-Id header = %q, want value from --org-id flag", gotOrg)
	}
}
