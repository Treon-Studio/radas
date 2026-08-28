package worker

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	cmdauth "github.com/raizora/radas/v4/cmd/auth"
	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/config"
)

// runWorker executes a worker subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runWorker(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runWorkerEnv(t, srvURL, nil, args...)
}

// runWorkerEnv executes a worker subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runWorkerEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "proj-1")
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())

	if creds != nil {
		c := *creds
		if c.APIURL == "" {
			c.APIURL = srvURL
		}
		if err := cliauth.NewStoreAt(os.Getenv("RADAS_CONFIG_DIR")).Save(c); err != nil {
			t.Fatalf("seed stored credentials: %v", err)
		}
	}

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = w

	var buf strings.Builder
	// A fresh production-shaped root per call: cobra's Execute() on a child
	// delegates to Root(), so reusing the package-level Cmd directly would
	// pick up stale args from any earlier root-based test in this package.
	// The group name is prepended because these helpers pass subcommand args
	// only (the group command used to be the execution root).
	root := &cobra.Command{Use: "radas"}
	config.RegisterPersistentFlags(root)
	root.AddCommand(Cmd)
	resetParsedFlags(Cmd)
	root.SetOut(&buf)
	root.SetErr(&buf)
	root.SetArgs(append([]string{Cmd.Name()}, args...))
	cmdErr := root.Execute()

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

func TestWorkerListSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/admin/workers" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"workers": []map[string]any{{
				"id": "w-01", "name": "runner-sg1", "enabled": true,
				"lastSeenAt": 1735689600, "currentExecutionId": "exec-9",
			}},
		})
	}))
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("worker list: %v", err)
	}
	if !strings.Contains(out, "runner-sg1") {
		t.Errorf("worker row missing from output:\n%s", out)
	}
}

func TestWorkerListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	// 401 excluded: surfaces as typed ErrNotAuthenticated without a request
	// ID (see TestWorkerWithoutCredentialsSurfacesNotAuthenticated).
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runWorker(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"worker-node-01", "worker-node-02", "radas-runner-sg1"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: static fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestWorkerListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"success": true, "workers": []}`)
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("worker list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No workers registered") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

// TestWorkerDrainUnimplementedIsExplicitError proves drain never claims a
// remote state change: the control plane has no drain route, so the command
// fails explicitly without calling any endpoint.
func TestWorkerDrainUnimplementedIsExplicitError(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "drain", "worker-node-01")
	if err == nil {
		t.Fatal("worker drain must fail explicitly; the control plane has no drain route")
	}
	if strings.Contains(out, "✔") || strings.Contains(out, "DRAINING") {
		t.Errorf("fabricated drain success printed:\n%s", out)
	}
	if hits != 0 {
		t.Errorf("drain called the server %d time(s); unwired mutations must not invent calls", hits)
	}
}

func TestWorkerStatusWiredToQueue(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/queue" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"queued": []map[string]any{
				{"id": "exec-1", "runName": "prod-vpc/plan"},
				{"id": "exec-2", "runName": "staging/apply"},
			},
			"count": 2,
		})
	}))
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "status")
	if err != nil {
		t.Fatalf("worker status: %v", err)
	}
	if !strings.Contains(out, "2") || !strings.Contains(out, "exec-1") {
		t.Errorf("server queue data missing from output:\n%s", out)
	}
}

func TestWorkerStatusFailureNeverPrintsFakeHealth(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "status")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "OPTIMAL") || strings.Contains(out, "Pending Jobs") {
		t.Errorf("fabricated queue health printed:\n%s", out)
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

// runWorkerRoot executes the command through a production-shaped root command so
// the shared persistent flags (--api-url/--token) are available, with stdout
// captured. RADAS_* env fallbacks are pinned empty so the flags are the only
// source of the runtime configuration.
func runWorkerRoot(t *testing.T, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "proj-1")

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = w

	var buf strings.Builder
	root := &cobra.Command{Use: "radas"}
	config.RegisterPersistentFlags(root)
	root.AddCommand(Cmd)
	resetParsedFlags(Cmd)
	root.SetOut(&buf)
	root.SetErr(&buf)
	root.SetArgs(args)
	cmdErr := root.Execute()

	os.Stdout = old
	_ = w.Close()
	captured, _ := io.ReadAll(r)

	return buf.String() + string(captured), cmdErr
}

// authRecorder returns a server that records the Authorization header of the
// remote call and answers with body (the command under test must succeed).
func authRecorder(t *testing.T, body string, gotAuth *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

// The adapter must authenticate from the credentials stored by
// `radas auth login` when no --token/RADAS_TOKEN override is present.
func TestWorkerAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"workers": []}`, &gotAuth)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runWorkerEnv(t, srv.URL, creds, "list"); err != nil {
		t.Fatalf("worker with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestWorkerWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runWorker(t, srv.URL, "list")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestWorkerStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	_, err := runWorkerEnv(t, srv.URL, creds, "list")
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
func TestWorkerTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"workers": []}`, &gotAuth)
	defer srv.Close()

	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	if err := cliauth.NewStoreAt(dir).Save(cliauth.Credentials{
		APIURL:      "http://not-the-test-server.invalid",
		AccessToken: "stored-access-token",
		Username:    "alice",
	}); err != nil {
		t.Fatalf("seed stored credentials: %v", err)
	}

	if _, err := runWorkerRoot(t, "--api-url", srv.URL, "--token", "ci-override-token", "worker", "list"); err != nil {
		t.Fatalf("worker with token override: %v", err)
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
