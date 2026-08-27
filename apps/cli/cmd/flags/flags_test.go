package flags

import (
	"bytes"
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

// runFlags executes a flags subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runFlags(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "org-test")
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

func TestFlagsListSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/flags" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"flags": []map[string]any{{
				"key": "dark-mode-v2", "name": "Dark Mode", "enabled": true,
				"rollout_percent": 100, "kill_switch": false, "scope_type": "global",
			}},
		})
	}))
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("flags list: %v", err)
	}
	if !strings.Contains(out, "dark-mode-v2") {
		t.Errorf("flag row missing from output:\n%s", out)
	}
}

func TestFlagsListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runFlags(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"dark-mode-v2", "beta-k8s-engine", "circuit-breaker-db"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: static fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestFlagsListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"flags": []}`)
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("flags list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No feature flags found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestFlagsGetSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/flags/dark-mode-v2" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"key": "dark-mode-v2", "name": "Dark Mode", "enabled": true,
			"rollout_percent": 80, "kill_switch": false, "scope_type": "global",
		})
	}))
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "get", "dark-mode-v2")
	if err != nil {
		t.Fatalf("flags get: %v", err)
	}
	if !strings.Contains(out, "80%") {
		t.Errorf("server-provided rollout missing from output:\n%s", out)
	}
}

func TestFlagsGetFailureNeverPrintsFakeFlag(t *testing.T) {
	srv := statusServer(t, http.StatusNotFound, `{"error":"not found"}`)
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "get", "dark-mode-v2")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "Status: Enabled") || strings.Contains(out, "100%") {
		t.Errorf("fabricated flag details printed:\n%s", out)
	}
}

func TestFlagsSetPatchesServerFlag(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotBody   map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"flag":    map[string]any{"key": "dark-mode-v2", "enabled": true},
		})
	}))
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "set", "dark-mode-v2", "true")
	if err != nil {
		t.Fatalf("flags set: %v", err)
	}
	if gotMethod != http.MethodPatch {
		t.Errorf("request method = %s, want PATCH (server has no /toggle route)", gotMethod)
	}
	if gotPath != "/api/flags/dark-mode-v2" {
		t.Errorf("request path = %s, want /api/flags/dark-mode-v2", gotPath)
	}
	if gotBody["enabled"] != true {
		t.Errorf("request body = %v, want {\"enabled\": true}", gotBody)
	}
	if !strings.Contains(out, "dark-mode-v2") || !strings.Contains(out, "true") {
		t.Errorf("confirmation missing from output:\n%s", out)
	}
}

func TestFlagsSetFailureNeverClaimsSuccess(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runFlags(t, srv.URL, "set", "dark-mode-v2", "true")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		if strings.Contains(out, "✔") || strings.Contains(out, "set to true") {
			t.Errorf("status %d: fabricated success printed:\n%s", code, out)
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestFlagsKillPatchesKillSwitch(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.URL.Path != "/api/flags/dark-mode-v2" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"flag":    map[string]any{"key": "dark-mode-v2", "kill_switch": true},
		})
	}))
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "kill", "dark-mode-v2")
	if err != nil {
		t.Fatalf("flags kill: %v", err)
	}
	if gotBody["kill_switch"] != true {
		t.Errorf("request body = %v, want {\"kill_switch\": true}", gotBody)
	}
	if !strings.Contains(out, "dark-mode-v2") {
		t.Errorf("kill confirmation missing from output:\n%s", out)
	}
}

func TestFlagsKillFailureNeverClaimsActivation(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	defer srv.Close()

	out, err := runFlags(t, srv.URL, "kill", "dark-mode-v2")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "activated") || strings.Contains(out, "⚠️") {
		t.Errorf("fabricated kill-switch success printed:\n%s", out)
	}
}

// TestFlagsListUsesCentralRuntimeConfig proves the flags command factory no
// longer resolves RADAS_API_URL/RADAS_TOKEN on its own: the request must be
// driven end to end by the shared LoadRuntimeConfig path, including the
// --api-url/--token/--project-id flags and their environment fallbacks.
func TestFlagsListUsesCentralRuntimeConfig(t *testing.T) {
	var (
		gotPath      string
		gotAuth      string
		gotProjectID string
		gotRequestID string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotProjectID = r.Header.Get("X-Project-Id")
		gotRequestID = r.Header.Get("X-Request-Id")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"flags": []map[string]any{{
				"key":             "central-config-flag",
				"name":            "Central Config Flag",
				"enabled":         true,
				"rollout_percent": 42,
				"kill_switch":     false,
				"scope_type":      "project",
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
		"--token", "test-token-123",
		"--project-id", "proj-central",
		"flags", "list",
	})

	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)

	if err := root.Execute(); err != nil {
		t.Fatalf("flags list: %v", err)
	}

	if gotPath != "/api/flags" {
		t.Errorf("request path = %q, want /api/flags (factory ignored --api-url?)", gotPath)
	}
	if gotAuth != "Bearer test-token-123" {
		t.Errorf("Authorization header = %q, want bearer token from --token flag", gotAuth)
	}
	if gotProjectID != "proj-central" {
		t.Errorf("X-Project-Id header = %q, want value from --project-id flag", gotProjectID)
	}
	if gotRequestID == "" {
		t.Error("X-Request-Id header missing; shared client must correlate requests")
	}
}
