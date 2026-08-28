package testcmd

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

// runTest executes a test subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runTest(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runTestEnv(t, srvURL, nil, args...)
}

// runTestEnv executes a test subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runTestEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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

func testCasesBody(cases ...map[string]any) string {
	b, _ := json.Marshal(cases)
	return `{"test_cases": ` + string(b) + `, "limit": 100, "offset": 0, "has_more": false}`
}

func TestTestListUsesControlPlaneRegistry(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(testCasesBody(map[string]any{
			"id": "tc-abc", "name": "Public CIDR closed", "kind": "tofu", "stack": "prod-vpc", "enabled": true,
		})))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("test list: %v", err)
	}
	if gotPath != "/api/tests" {
		t.Errorf("test list must use GET /api/tests, got %s", gotPath)
	}
	if !strings.Contains(out, "tc-abc") || !strings.Contains(out, "prod-vpc") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
	for _, fake := range []string{"vpc_cidr_block_valid.tftest.hcl", "nat_gateway_redundancy", "idempotency_check.yml"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated test row %q printed:\n%s", fake, out)
		}
	}
}

func TestTestListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"test_cases": [], "has_more": false}`)
	defer srv.Close()

	out, err := runTest(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("test list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No test cases registered") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestTestShowSelectsFromListAndFailsOnUnknown(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(testCasesBody(map[string]any{
			"id": "tc-abc", "name": "Public CIDR closed", "kind": "tofu", "stack": "prod-vpc", "enabled": true,
		})))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "show", "tc-abc")
	if err != nil {
		t.Fatalf("test show: %v", err)
	}
	if hits != 1 {
		t.Errorf("show must fetch the list exactly once, got %d hits", hits)
	}
	if !strings.Contains(out, "tc-abc") || !strings.Contains(out, "Public CIDR closed") {
		t.Errorf("expected the real test case rendered:\n%s", out)
	}
	if strings.Contains(out, "All 4 assertions satisfied") {
		t.Errorf("fabricated assertion detail printed:\n%s", out)
	}

	out, err = runTest(t, srv.URL, "show", "tc-nope")
	if err == nil {
		t.Fatal("expected an error for an unknown test id")
	}
	if !strings.Contains(out, "not found") {
		t.Errorf("expected an explicit not-found error, got:\n%s", out)
	}
}

func TestTestRunPostsToServerRunRoute(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"success": true, "result": {"status": "passed", "passed": true, "name": "Public CIDR closed", "severity": "blocker", "stack": "prod-vpc"}}`))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "run", "tc-abc")
	if err != nil {
		t.Fatalf("test run: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/tests/tc-abc/run" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(out, "PASSED") {
		t.Errorf("expected the real verdict in output:\n%s", out)
	}
	for _, fake := range []string{"All 3 test suites passed", "(14ms)", "(22ms)"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated run result %q printed:\n%s", fake, out)
		}
	}
}

func TestTestRunFailureSurfacesAndNeverPasses(t *testing.T) {
	// A 401 with no stored credentials surfaces as the typed
	// ErrNotAuthenticated (no request ID), so a plain server failure is used
	// to assert request-ID correlation here.
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	out, err := runTest(t, srv.URL, "run", "tc-abc")
	srv.Close()

	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestTestRunFailedVerdictIsRendered(t *testing.T) {
	srv := statusServer(t, http.StatusCreated, `{"success": true, "result": {"status": "failed", "passed": false, "name": "Public CIDR closed", "severity": "blocker"}}`)
	defer srv.Close()

	out, err := runTest(t, srv.URL, "run", "tc-abc")
	if err != nil {
		t.Fatalf("test run (failed verdict is still a successful API call): %v", err)
	}
	if !strings.Contains(out, "FAILED") {
		t.Errorf("expected an honest FAILED verdict:\n%s", out)
	}
	if !strings.Contains(out, "blocker") {
		t.Errorf("expected severity to be shown for failures:\n%s", out)
	}
}

func TestTestIdempotencyFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "idempotency", "playbooks/main.yml")
	if err == nil {
		t.Fatal("test idempotency must fail explicitly")
	}
	if hit {
		t.Error("test idempotency must not call the server")
	}
	for _, fake := range []string{"VERIFIED", "changed=0", "Pass 2"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated idempotency result %q printed:\n%s", fake, out)
		}
	}
}

func TestTestScoreUsesControlPlaneScoreEndpoint(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.URL.Query().Get("stack") != "prod-vpc" {
			t.Errorf("expected stack query param, got %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"score": 87, "grade": "B", "total_tests": 5, "passed_tests": 4, "failed_tests": 1, "deductions": {"blocker": 0, "warning": 10, "info": 3}}`))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "score", "prod-vpc")
	if err != nil {
		t.Fatalf("test score: %v", err)
	}
	if gotPath != "/api/test-cases/score" {
		t.Errorf("test score must use GET /api/test-cases/score, got %s", gotPath)
	}
	if !strings.Contains(out, "87") || !strings.Contains(out, "B") {
		t.Errorf("expected the real score in output:\n%s", out)
	}
	for _, fake := range []string{"96 / 100", "A+", "FinOps & Cost Accuracy"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated score line %q printed:\n%s", fake, out)
		}
	}
}

// runTestRoot executes the command through a production-shaped root command so
// the shared persistent flags (--api-url/--token) are available, with stdout
// captured. RADAS_* env fallbacks are pinned empty so the flags are the only
// source of the runtime configuration.
func runTestRoot(t *testing.T, args ...string) (string, error) {
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
func TestTestAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"test_cases": []}`, &gotAuth)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runTestEnv(t, srv.URL, creds, "list"); err != nil {
		t.Fatalf("test with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestTestWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runTest(t, srv.URL, "list")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestTestStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	_, err := runTestEnv(t, srv.URL, creds, "list")
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
func TestTestTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"test_cases": []}`, &gotAuth)
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

	if _, err := runTestRoot(t, "--api-url", srv.URL, "--token", "ci-override-token", "test", "list"); err != nil {
		t.Fatalf("test with token override: %v", err)
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
