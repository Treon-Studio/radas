package cloud

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

// runCloud executes a cloud subcommand with the runtime configuration pointed
// at srvURL ("" keeps the built-in default) and returns the combined cobra and
// stdout output together with the command error.
func runCloud(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runCloudEnv(t, srvURL, nil, args...)
}

// runCloudEnv executes a cloud subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runCloudEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
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

func TestCloudProbeIsExplicitFailureNotFakeRemoteState(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "probe", "aws")
	if err == nil {
		t.Fatal("cloud probe must fail explicitly until it is wired to the control plane")
	}
	if strings.Contains(out, "Authentication OK") || strings.Contains(out, "Permissions OK") || strings.Contains(out, "Latency") {
		t.Errorf("fabricated probe success printed:\n%s", out)
	}
	if hits != 0 {
		t.Errorf("probe called the server %d time(s); unwired commands must not invent calls", hits)
	}
}

func TestCloudInventoryIsExplicitFailureNotFakeRemoteState(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "inventory")
	if err == nil {
		t.Fatal("cloud inventory must fail explicitly until it is wired to the control plane")
	}
	for _, fake := range []string{"vpc-0a1b2c3d", "vol-99887766", "i-0987654321", "MANAGED"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated inventory row %q printed:\n%s", fake, out)
		}
	}
	if hits != 0 {
		t.Errorf("inventory called the server %d time(s); unwired commands must not invent calls", hits)
	}
}

// TestCloudInventoryErrorMessageIsFactual pins the not-wired message to the
// real control-plane surface: inventory is served per stack at
// GET /api/cloud/stacks/<name>/inventory (project-scoped, no BYOC account
// needed), with per-account BYOC inventory as a separate flow. The old text
// wrongly claimed inventory is only served per registered BYOC account.
func TestCloudInventoryErrorMessageIsFactual(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	_, err := runCloud(t, srv.URL, "inventory")
	if err == nil {
		t.Fatal("cloud inventory must fail until a stack/account selector is wired (Task 2.4)")
	}
	if hits != 0 {
		t.Errorf("unwired inventory must not call the server, got %d hit(s)", hits)
	}
	if !strings.Contains(err.Error(), "/api/cloud/stacks/<name>/inventory") {
		t.Errorf("error must point at the real per-stack inventory endpoint:\n%v", err)
	}
	if !strings.Contains(err.Error(), "no server call") {
		t.Errorf("unwired command must be labeled as making no server call:\n%v", err)
	}
	if strings.Contains(err.Error(), "requires a registered BYOC account and is served per account") {
		t.Errorf("error must not claim per-account BYOC is the only inventory path:\n%v", err)
	}
}

func TestCloudImportIsExplicitlyLocal(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "import", "aws_vpc", "module.vpc.aws_vpc.main", "vpc-123")
	if err != nil {
		t.Fatalf("cloud import: %v", err)
	}
	if hits != 0 {
		t.Errorf("import must stay local, but the server was hit %d time(s)", hits)
	}
	if !strings.Contains(out, "local") {
		t.Errorf("local generation must be labeled as local:\n%s", out)
	}
	if !strings.Contains(out, "module.vpc.aws_vpc.main") {
		t.Errorf("generated import block missing from output:\n%s", out)
	}
}

func TestCloudDiffWiredToStackDrift(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/cloud/stacks/prod-vpc/drift" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"enabled": true, "status": "in_sync", "last_run_id": "run-9",
		})
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "diff", "prod-vpc")
	if err != nil {
		t.Fatalf("cloud diff: %v", err)
	}
	if !strings.Contains(out, "in_sync") {
		t.Errorf("server drift status missing from output:\n%s", out)
	}
}

func TestCloudDiffFailureNeverClaimsZeroDrift(t *testing.T) {
	// 401 excluded: surfaces as typed ErrNotAuthenticated without a request
	// ID (see TestCloudWithoutCredentialsSurfacesNotAuthenticated).
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runCloud(t, srv.URL, "diff", "prod-vpc")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		if strings.Contains(out, "14/14") || strings.Contains(out, "Zero out-of-band drifts") || strings.Contains(out, "in sync") {
			t.Errorf("status %d: fabricated drift-free claim printed:\n%s", code, out)
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

// runCloudRoot executes the command through a production-shaped root command so
// the shared persistent flags (--api-url/--token) are available, with stdout
// captured. RADAS_* env fallbacks are pinned empty so the flags are the only
// source of the runtime configuration.
func runCloudRoot(t *testing.T, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")

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
func TestCloudAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"enabled": true, "status": "in_sync", "last_run_id": "run-1"}`, &gotAuth)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runCloudEnv(t, srv.URL, creds, "diff", "stack-1"); err != nil {
		t.Fatalf("cloud with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestCloudWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runCloud(t, srv.URL, "diff", "stack-1")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestCloudStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	_, err := runCloudEnv(t, srv.URL, creds, "diff", "stack-1")
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
func TestCloudTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"enabled": true, "status": "in_sync", "last_run_id": "run-1"}`, &gotAuth)
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

	if _, err := runCloudRoot(t, "--api-url", srv.URL, "--token", "ci-override-token", "cloud", "diff", "stack-1"); err != nil {
		t.Fatalf("cloud with token override: %v", err)
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
