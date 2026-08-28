package state

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	cmdauth "github.com/raizora/radas/v4/cmd/auth"
	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/config"
)

// runState executes a state subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runState(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runStateEnv(t, srvURL, nil, args...)
}

// runStateEnv executes a state subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runStateEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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

func stateBody(present bool, resources []string) string {
	if !present {
		return `{"state_present": false, "resource_count": 0, "resources": [], "message": "No terraform.tfstate on disk."}`
	}
	return `{"state_present": true, "resource_count": ` + strconv.Itoa(len(resources)) + `, "resources": ` + jsonString(resources) + `}`
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestStatePullReportsRealState(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(stateBody(true, []string{"aws_vpc.main", "aws_subnet.public_a"})))
	}))
	defer srv.Close()

	out, err := runState(t, srv.URL, "pull", "prod-vpc")
	if err != nil {
		t.Fatalf("state pull: %v", err)
	}
	if gotPath != "/api/cloud/stacks/prod-vpc/state" {
		t.Errorf("state pull must use GET /api/cloud/stacks/<name>/state, got %s", gotPath)
	}
	if !strings.Contains(out, "aws_vpc.main") {
		t.Errorf("real resource addresses missing from output:\n%s", out)
	}
	if strings.Contains(out, "\"version\": 4") || strings.Contains(out, "aws_internet_gateway.gw") {
		t.Errorf("fabricated tfstate JSON must not be printed:\n%s", out)
	}
}

func TestStatePullReportsAbsentStateHonestly(t *testing.T) {
	srv := statusServer(t, http.StatusOK, stateBody(false, nil))
	defer srv.Close()

	out, err := runState(t, srv.URL, "pull", "prod-vpc")
	if err != nil {
		t.Fatalf("state pull on absent state: %v", err)
	}
	if !strings.Contains(out, "not present") {
		t.Errorf("expected an honest absent-state report, got:\n%s", out)
	}
}

func TestStatePullServerErrorSurfaces(t *testing.T) {
	// 401 excluded: surfaces as typed ErrNotAuthenticated without a request
	// ID (see TestStateWithoutCredentialsSurfacesNotAuthenticated).
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"Not found"}`)
		out, err := runState(t, srv.URL, "pull", "nope")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestStateUnlockUsesLockDeleteRoute(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotRawq   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotRawq = r.Method, r.URL.Path, r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok": true, "message": "lock released"}`))
	}))
	defer srv.Close()

	out, err := runState(t, srv.URL, "unlock", "prod-vpc", "-l", "lock_12345")
	if err != nil {
		t.Fatalf("state unlock: %v", err)
	}
	if gotMethod != http.MethodDelete || gotPath != "/api/cloud/stacks/prod-vpc/state/lock" {
		t.Errorf("unexpected call %s %s (must be DELETE /api/cloud/stacks/<name>/state/lock)", gotMethod, gotPath)
	}
	if !strings.Contains(gotRawq, "lock_id=lock_12345") {
		t.Errorf("lock_id query param missing: %s", gotRawq)
	}
	if !strings.Contains(out, "released") {
		t.Errorf("expected success text after server confirmation:\n%s", out)
	}
}

func TestStateUnlockFailureNeverPrintsSuccess(t *testing.T) {
	for _, tc := range []struct {
		code int
		body string
	}{
		{http.StatusConflict, `{"ok": false, "error": "lock id mismatch"}`},
		{http.StatusUnauthorized, `{"error":"boom"}`},
		{http.StatusNotFound, `{"error":"Not found"}`},
	} {
		srv := statusServer(t, tc.code, tc.body)
		out, err := runState(t, srv.URL, "unlock", "prod-vpc", "-l", "wrong")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", tc.code)
		}
		if strings.Contains(out, "successfully") {
			t.Errorf("status %d: fake success printed:\n%s", tc.code, out)
		}
		if !strings.Contains(out, "request req-") && tc.code != http.StatusConflict && tc.code != http.StatusUnauthorized {
			t.Errorf("status %d: error output must carry the request ID:\n%s", tc.code, out)
		}
	}
}

func TestStateUnlockOkFalseSurfacesServerMessage(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"ok": false, "error": "lock id mismatch"}`)
	defer srv.Close()

	out, err := runState(t, srv.URL, "unlock", "prod-vpc", "-l", "wrong")
	if err == nil {
		t.Fatal("ok=false must surface as an error")
	}
	if !strings.Contains(out, "lock id mismatch") {
		t.Errorf("server message missing from error output:\n%s", out)
	}
}

func TestStateGraphRendersRealResourcesLocally(t *testing.T) {
	var stateHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/cloud/stacks/prod-vpc/state" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		stateHits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(stateBody(true, []string{"aws_vpc.main", "aws_subnet.public_a"})))
	}))
	defer srv.Close()

	out, err := runState(t, srv.URL, "graph", "prod-vpc")
	if err != nil {
		t.Fatalf("state graph: %v", err)
	}
	if stateHits != 1 {
		t.Errorf("state graph must fetch the real state exactly once, got %d hits", stateHits)
	}
	if !strings.Contains(out, "aws_vpc.main") || !strings.Contains(out, "aws_subnet.public_a") {
		t.Errorf("real resources missing from the rendered graph:\n%s", out)
	}
	for _, fake := range []string{"aws_internet_gateway.gw", "aws_route_table.public"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated resource %q printed:\n%s", fake, out)
		}
	}
}

func TestStateGraphAbsentStateReportsHonestly(t *testing.T) {
	srv := statusServer(t, http.StatusOK, stateBody(false, nil))
	defer srv.Close()

	out, err := runState(t, srv.URL, "graph", "prod-vpc")
	if err != nil {
		t.Fatalf("state graph on absent state: %v", err)
	}
	if !strings.Contains(out, "nothing to render") {
		t.Errorf("expected an honest empty-graph report, got:\n%s", out)
	}
}

// runStateRoot executes the command through a production-shaped root command so
// the shared persistent flags (--api-url/--token) are available, with stdout
// captured. RADAS_* env fallbacks are pinned empty so the flags are the only
// source of the runtime configuration.
func runStateRoot(t *testing.T, args ...string) (string, error) {
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
func TestStateAuthenticatesFromStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"state_present": false, "resource_count": 0, "resources": null, "message": "no state uploaded"}`, &gotAuth)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runStateEnv(t, srv.URL, creds, "pull", "stack-1"); err != nil {
		t.Fatalf("state with stored credentials: %v", err)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestStateWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runState(t, srv.URL, "pull", "stack-1")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// A stored access token without a refresh token cannot be renewed on a 401:
// the adapter must surface the typed remediation error instead of a raw 401.
func TestStateStoredSessionWithoutRefreshTokenSurfacesTypedError(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	_, err := runStateEnv(t, srv.URL, creds, "pull", "stack-1")
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
func TestStateTokenOverrideWinsOverStoredCredentials(t *testing.T) {
	var gotAuth string
	srv := authRecorder(t, `{"state_present": false, "resource_count": 0, "resources": null, "message": "no state uploaded"}`, &gotAuth)
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

	if _, err := runStateRoot(t, "--api-url", srv.URL, "--token", "ci-override-token", "state", "pull", "stack-1"); err != nil {
		t.Fatalf("state with token override: %v", err)
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
