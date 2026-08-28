package policy

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

// runPolicy executes a policy subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runPolicy(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runPolicyEnv(t, srvURL, nil, args...)
}

// runPolicyEnv executes a policy subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runPolicyEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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

func TestPolicyViolationsUsesControlPlaneRoute(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"count": 1,
			"violations": []map[string]any{{
				"id": "pv-1", "stack": "bytedc-db", "rule_id": "POL-ENC-01",
				"severity": "HIGH", "resource": "data_vol", "message": "Missing disk encryption flag",
			}},
		})
	}))
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "violations")
	if err != nil {
		t.Fatalf("policy violations: %v", err)
	}
	if gotPath != "/api/cloud/policy/violations" {
		t.Errorf("policy violations must use GET /api/cloud/policy/violations, got %s", gotPath)
	}
	if !strings.Contains(out, "POL-ENC-01") || !strings.Contains(out, "bytedc-db") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
}

func TestPolicyViolationsServerErrorNeverPrintsFallbackRows(t *testing.T) {
	// 401 excluded: surfaces as typed ErrNotAuthenticated without a request
	// ID (see TestPolicyWithoutCredentialsSurfacesNotAuthenticated).
	for _, code := range []int{http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runPolicy(t, srv.URL, "violations")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"POL-ENC-01", "POL-TAG-04", "Missing disk encryption flag", "staging-k8s/node_pool"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: fabricated fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestPolicyViolationsEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"count": 0, "violations": []}`)
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "violations")
	if err != nil {
		t.Fatalf("policy violations on empty server response: %v", err)
	}
	if !strings.Contains(out, "No policy violations recorded") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestPolicyCheckFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "check", "prod-vpc")
	if err == nil {
		t.Fatal("policy check must fail explicitly (no evaluation route)")
	}
	if hit {
		t.Error("policy check must not call the server")
	}
	if !strings.Contains(out, "not available") {
		t.Errorf("expected an explicit unavailability error, got:\n%s", out)
	}
	for _, fake := range []string{"RULE-001", "3/3 rules passed", "PASSED"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated rule result %q printed:\n%s", fake, out)
		}
	}
}

func TestPolicyExemptFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "exempt", "POL-ENC-01", "bytedc-db")
	if err == nil {
		t.Fatal("policy exempt must fail explicitly (no exemption route)")
	}
	if hit {
		t.Error("policy exempt must not call the server")
	}
	if !strings.Contains(out, "not available") {
		t.Errorf("expected an explicit unavailability error, got:\n%s", out)
	}
	if strings.Contains(out, "Exemption granted") {
		t.Errorf("fabricated exemption success must not be printed:\n%s", out)
	}
}

// runPolicyRoot executes the command through a production-shaped root command so
// the shared persistent flags (--api-url/--token) are available, with stdout
// captured. RADAS_* env fallbacks are pinned empty so the flags are the only
// source of the runtime configuration.
func runPolicyRoot(t *testing.T, args ...string) (string, error) {
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
func TestPolicyAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"count": 0, "violations": []}`, &gotAuth)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runPolicyEnv(t, srv.URL, creds, "violations"); err != nil {
		t.Fatalf("policy with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestPolicyWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runPolicy(t, srv.URL, "violations")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestPolicyStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	_, err := runPolicyEnv(t, srv.URL, creds, "violations")
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
func TestPolicyTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"count": 0, "violations": []}`, &gotAuth)
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

	if _, err := runPolicyRoot(t, "--api-url", srv.URL, "--token", "ci-override-token", "policy", "violations"); err != nil {
		t.Fatalf("policy with token override: %v", err)
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
