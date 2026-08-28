package drift

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

// runDrift executes a drift subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runDrift(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runDriftEnv(t, srvURL, nil, args...)
}

// runDriftEnv executes a drift subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runDriftEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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

func TestDriftScanQueuesRealDriftCheck(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status": "queued", "stack": "prod-vpc", "run_id": "run-1"}`))
	}))
	defer srv.Close()

	out, err := runDrift(t, srv.URL, "scan", "prod-vpc")
	if err != nil {
		t.Fatalf("drift scan: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/cloud/stacks/prod-vpc/drift-check" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(out, "queued") || !strings.Contains(out, "run-1") {
		t.Errorf("queued run details missing from output:\n%s", out)
	}
	for _, fake := range []string{"staging-k8s", "bytedc-db", "IN SYNC\t0"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated scan row %q printed:\n%s", fake, out)
		}
	}
}

func TestDriftScanRequiresStackAndSurfacesErrors(t *testing.T) {
	out, err := runDrift(t, "http://127.0.0.1:1", "scan")
	if err == nil {
		t.Fatal("drift scan without a stack must fail (no all-stacks route)")
	}
	if strings.Contains(out, "IN SYNC") {
		t.Errorf("fabricated scan table printed:\n%s", out)
	}

	// A 401 with no stored credentials surfaces as the typed
	// ErrNotAuthenticated (no request ID), so a plain server failure is used
	// to assert request-ID correlation here.
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	out, err = runDrift(t, srv.URL, "scan", "prod-vpc")
	srv.Close()
	if err == nil {
		t.Fatal("expected an error on server failure")
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestDriftRemediateQueuesApplyAction(t *testing.T) {
	var (
		gotPath string
		gotBody map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"ok": true, "run_id": "run-2", "status": "QUEUED"}`))
	}))
	defer srv.Close()

	out, err := runDrift(t, srv.URL, "remediate", "prod-vpc")
	if err != nil {
		t.Fatalf("drift remediate: %v", err)
	}
	if gotPath != "/api/cloud/stacks/prod-vpc/actions" {
		t.Errorf("remediate must use POST /api/cloud/stacks/<name>/actions, got %s", gotPath)
	}
	if gotBody["action"] != "apply" {
		t.Errorf("remediate body action = %v, want apply", gotBody["action"])
	}
	if !strings.Contains(out, "queued") {
		t.Errorf("expected honest queued-run report:\n%s", out)
	}
	if strings.Contains(out, "0 changes needed") || strings.Contains(out, "reconciled to desired") {
		t.Errorf("fabricated reconciliation success printed:\n%s", out)
	}
}

func TestDriftScheduleGetAndPut(t *testing.T) {
	var (
		gotMethod string
		gotBody   map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		if r.Method == http.MethodPut {
			_ = json.NewDecoder(r.Body).Decode(&gotBody)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"success": true, "stack": "prod-vpc", "schedule": {"enabled": true, "cron": "0 */6 * * *", "alert_on_drift": true}}`))
			return
		}
		_, _ = w.Write([]byte(`{"enabled": false, "cron": null, "alert_on_drift": true}`))
	}))
	defer srv.Close()

	out, err := runDrift(t, srv.URL, "schedule", "prod-vpc")
	if err != nil {
		t.Fatalf("drift schedule get: %v", err)
	}
	if gotMethod != http.MethodGet {
		t.Errorf("schedule without cron must GET, got %s", gotMethod)
	}
	if !strings.Contains(out, "enabled=false") {
		t.Errorf("expected current schedule rendered:\n%s", out)
	}

	out, err = runDrift(t, srv.URL, "schedule", "prod-vpc", "0 */6 * * *")
	if err != nil {
		t.Fatalf("drift schedule set: %v", err)
	}
	if gotMethod != http.MethodPut {
		t.Errorf("schedule with cron must PUT, got %s", gotMethod)
	}
	if gotBody["cron"] != "0 */6 * * *" || gotBody["enabled"] != true {
		t.Errorf("schedule payload = %v", gotBody)
	}
	if !strings.Contains(out, "server confirmed") {
		t.Errorf("expected server-confirmed success:\n%s", out)
	}
}

// runDriftRoot executes the command through a production-shaped root command so
// the shared persistent flags (--api-url/--token) are available, with stdout
// captured. RADAS_* env fallbacks are pinned empty so the flags are the only
// source of the runtime configuration.
func runDriftRoot(t *testing.T, args ...string) (string, error) {
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
func TestDriftAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"status": "queued", "stack": "stack-1", "run_id": "run-1"}`, &gotAuth)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runDriftEnv(t, srv.URL, creds, "scan", "stack-1"); err != nil {
		t.Fatalf("drift with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestDriftWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runDrift(t, srv.URL, "scan", "stack-1")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestDriftStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	_, err := runDriftEnv(t, srv.URL, creds, "scan", "stack-1")
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
func TestDriftTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"status": "queued", "stack": "stack-1", "run_id": "run-1"}`, &gotAuth)
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

	if _, err := runDriftRoot(t, "--api-url", srv.URL, "--token", "ci-override-token", "drift", "scan", "stack-1"); err != nil {
		t.Fatalf("drift with token override: %v", err)
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
