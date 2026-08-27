package registry

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runRegistry executes a registry subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runRegistry(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "proj-1")
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

func TestRegistryListSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/registry" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]any{{
				"type": "tofu-block", "slug": "vpc-ha", "name": "VPC HA",
				"version": "v1.2.0", "description": "High-availability VPC",
			}},
		})
	}))
	defer srv.Close()

	out, err := runRegistry(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("registry list: %v", err)
	}
	if !strings.Contains(out, "vpc-ha") {
		t.Errorf("registry row missing from output:\n%s", out)
	}
}

func TestRegistryListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runRegistry(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"vpc-ha", "eks-cluster", "hardening", "docker"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: static fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestRegistryListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"items": []}`)
	defer srv.Close()

	out, err := runRegistry(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("registry list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No registry items found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestRegistryInstallPostsToServerInstallRoute(t *testing.T) {
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
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success":   true,
			"installed": map[string]any{"name": "vpc-ha"},
		})
	}))
	defer srv.Close()

	out, err := runRegistry(t, srv.URL, "install", "tofu-block/vpc-ha", "--stack", "prod-vpc")
	if err != nil {
		t.Fatalf("registry install: %v", err)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("request method = %s, want POST", gotMethod)
	}
	if gotPath != "/api/registry/vpc-ha/install" {
		t.Errorf("request path = %s, want /api/registry/vpc-ha/install (server has no /api/registry/install route)", gotPath)
	}
	if gotBody["stack"] != "prod-vpc" {
		t.Errorf("request body = %v, want stack prod-vpc", gotBody)
	}
	if !strings.Contains(out, "vpc-ha") || !strings.Contains(out, "prod-vpc") {
		t.Errorf("install confirmation missing from output:\n%s", out)
	}
}

func TestRegistryInstallRequiresStack(t *testing.T) {
	// Flag values persist across Execute calls on the shared command; reset
	// them so this test proves the no-stack failure path.
	if err := installCmd.Flags().Set("stack", ""); err != nil {
		t.Fatalf("reset stack flag: %v", err)
	}
	if err := installCmd.Flags().Set("version", ""); err != nil {
		t.Fatalf("reset version flag: %v", err)
	}

	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runRegistry(t, srv.URL, "install", "tofu-block/vpc-ha")
	if err == nil {
		t.Fatal("registry install without --stack must fail explicitly (the server installs into a stack)")
	}
	if strings.Contains(out, "✔") || strings.Contains(out, "Successfully installed") {
		t.Errorf("fabricated install success printed:\n%s", out)
	}
	if hits != 0 {
		t.Errorf("install without --stack called the server %d time(s)", hits)
	}
}

func TestRegistryInstallFailureNeverClaimsSuccess(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	defer srv.Close()

	out, err := runRegistry(t, srv.URL, "install", "tofu-block/vpc-ha", "--stack", "prod-vpc")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "Successfully installed") || strings.Contains(out, "✔") {
		t.Errorf("fabricated install success printed:\n%s", out)
	}
}

// TestRegistryPublishUnimplementedIsExplicitError proves publish never claims
// a remote publication: the control plane publishes from server-side stacks,
// not local directories, so the command fails explicitly without any call.
func TestRegistryPublishUnimplementedIsExplicitError(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runRegistry(t, srv.URL, "publish", ".")
	if err == nil {
		t.Fatal("registry publish must fail explicitly until it is wired to the control plane")
	}
	if strings.Contains(out, "published to private") || strings.Contains(out, "✔") {
		t.Errorf("fabricated publish success printed:\n%s", out)
	}
	if hits != 0 {
		t.Errorf("publish called the server %d time(s); unwired mutations must not invent calls", hits)
	}
}
