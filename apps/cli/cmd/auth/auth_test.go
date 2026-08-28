package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
)

const (
	testUser   = "alice"
	testPass   = "hunter2-password"
	testAccess = "cli-test-access-token"
	testRefrsh = "cli-test-refresh-token"
)

// newTestRoot wires the auth command group the same way main.go does, with a
// captured stdout and an isolated RADAS_CONFIG_DIR.
func newTestRoot(t *testing.T) (*cobra.Command, *bytes.Buffer, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)

	// Tests are never interactive: credentials come from the injected stdin.
	restoreStdin, restoreTerm := stdin, stdinIsTerminal
	stdin = strings.NewReader("")
	stdinIsTerminal = func() bool { return false }
	t.Cleanup(func() { stdin = restoreStdin; stdinIsTerminal = restoreTerm })

	out := &bytes.Buffer{}
	root := &cobra.Command{Use: "radas", SilenceErrors: true, SilenceUsage: true}
	config.RegisterPersistentFlags(root)
	root.SetOut(out)
	root.SetErr(io.Discard)
	root.AddCommand(Cmd)
	return root, out, dir
}

func storedCredentials(t *testing.T, dir string) cliauth.Credentials {
	t.Helper()
	creds, err := cliauth.NewStoreAt(dir).Load()
	if err != nil {
		t.Fatalf("load stored credentials: %v", err)
	}
	return creds
}

func seedCredentials(t *testing.T, dir, apiURL string, withRefresh bool) {
	t.Helper()
	creds := cliauth.Credentials{
		APIURL:      apiURL,
		AccessToken: testAccess,
		Username:    testUser,
	}
	if withRefresh {
		creds.RefreshToken = testRefrsh
	}
	if err := cliauth.NewStoreAt(dir).Save(creds); err != nil {
		t.Fatalf("seed store: %v", err)
	}
}

func jsonServer(t *testing.T, status int, body map[string]any, seen ...*[]*http.Request) *httptest.Server {
	t.Helper()
	var seenPtr *[]*http.Request
	if len(seen) > 0 {
		seenPtr = seen[0]
	}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if seenPtr != nil {
			*seenPtr = append(*seenPtr, r)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(body)
	}))
}

func runAuth(t *testing.T, root *cobra.Command, stdinContent string, args ...string) error {
	t.Helper()
	stdin = strings.NewReader(stdinContent)
	root.SetArgs(append([]string{"auth"}, args...))
	return root.Execute()
}

// --- login -----------------------------------------------------------------

func TestLoginSuccessPersistsCredentials(t *testing.T) {
	root, out, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusOK, map[string]any{
		"success":       true,
		"access_token":  testAccess,
		"refresh_token": testRefrsh,
		"user":          map[string]any{"id": "u1", "username": testUser},
	})
	defer srv.Close()

	if err := runAuth(t, root, testUser+"\n"+testPass+"\n", "login", "--api-url", srv.URL); err != nil {
		t.Fatalf("auth login: %v", err)
	}

	creds := storedCredentials(t, dir)
	if creds.APIURL != srv.URL {
		t.Errorf("stored api_url = %q, want %q", creds.APIURL, srv.URL)
	}
	if creds.AccessToken != testAccess || creds.RefreshToken != testRefrsh {
		t.Error("tokens were not persisted")
	}
	if creds.Username != testUser {
		t.Errorf("stored username = %q, want %q", creds.Username, testUser)
	}
	// No-token-logging guarantee: credentials never appear in command output.
	for _, secret := range []string{testAccess, testRefrsh, testPass} {
		if strings.Contains(out.String(), secret) {
			t.Errorf("command output leaked %q: %q", secret, out.String())
		}
	}
}

// The control plane resolves the user's organizations on login and returns
// the active one (the first membership, also embedded in the token). Login
// must persist it to the CLI selector so every subsequent remote command
// sends the right X-Org-Id without asking again.
func TestLoginPersistsActiveOrgToSelector(t *testing.T) {
	root, _, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusOK, map[string]any{
		"success":       true,
		"access_token":  testAccess,
		"refresh_token": testRefrsh,
		"orgs":          []map[string]any{{"id": "org-abc", "slug": "acme", "name": "Acme"}},
		"active_org_id": "org-abc",
		"user":          map[string]any{"id": "u1", "username": testUser},
	})
	defer srv.Close()

	if err := runAuth(t, root, testUser+"\n"+testPass+"\n", "login", "--api-url", srv.URL); err != nil {
		t.Fatalf("auth login: %v", err)
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("load selector: %v", err)
	}
	if sel.OrganizationID != "org-abc" {
		t.Errorf("selector org_id = %q, want the login response's active_org_id %q", sel.OrganizationID, "org-abc")
	}
	// The selector file holds identifiers only; it must never receive tokens.
	data, err := os.ReadFile(dir + "/" + config.SelectorFileName)
	if err != nil {
		t.Fatalf("read selector file: %v", err)
	}
	for _, secret := range []string{testAccess, testRefrsh, testPass} {
		if strings.Contains(string(data), secret) {
			t.Error("selector file must never contain credential material")
		}
	}
}

// Login must not wipe a previously chosen project when it records the active
// org, and a login without org context (active_org_id null) must leave the
// selector untouched.
func TestLoginPreservesProjectAndSkipsEmptyActiveOrg(t *testing.T) {
	root, _, _ := newTestRoot(t)
	if err := config.SaveSelector(config.Selector{OrganizationID: "org-old", ProjectID: "proj-7"}); err != nil {
		t.Fatalf("seed selector: %v", err)
	}

	srv := jsonServer(t, http.StatusOK, map[string]any{
		"success":       true,
		"access_token":  testAccess,
		"refresh_token": testRefrsh,
		"orgs":          []any{},
		"active_org_id": nil,
		"user":          map[string]any{"id": "u1", "username": testUser},
	})
	defer srv.Close()

	if err := runAuth(t, root, testUser+"\n"+testPass+"\n", "login", "--api-url", srv.URL); err != nil {
		t.Fatalf("auth login: %v", err)
	}

	sel, err := config.LoadSelector()
	if err != nil {
		t.Fatalf("load selector: %v", err)
	}
	if sel.OrganizationID != "org-old" || sel.ProjectID != "proj-7" {
		t.Errorf("selector = %+v, want the pre-login org %q and project %q untouched", sel, "org-old", "proj-7")
	}
}

func TestLoginInvalidCredentialsPersistsNothing(t *testing.T) {
	root, _, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusUnauthorized, map[string]any{
		"success": false,
		"error":   "Incorrect username or password",
	})
	defer srv.Close()

	err := runAuth(t, root, testUser+"\nwrong-password\n", "login", "--api-url", srv.URL)
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("error = %v, want ErrInvalidCredentials", err)
	}

	if _, loadErr := cliauth.NewStoreAt(dir).Load(); !errors.Is(loadErr, cliauth.ErrNoCredentials) {
		t.Errorf("failed login must persist nothing, load returned %v", loadErr)
	}
}

func TestLoginMFAChallengeFailsWithConsoleGuidance(t *testing.T) {
	root, _, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusOK, map[string]any{
		"success":      true,
		"mfa_required": true,
		"mfa_token":    "mfa-token-for-tests",
		"user":         map[string]any{"id": "u1", "username": testUser},
	})
	defer srv.Close()

	err := runAuth(t, root, testUser+"\n"+testPass+"\n", "login", "--api-url", srv.URL)
	if !errors.Is(err, ErrMFAUnsupported) {
		t.Fatalf("error = %v, want ErrMFAUnsupported", err)
	}
	if !strings.Contains(err.Error(), "console") {
		t.Errorf("MFA error should direct the user to the console, got %q", err.Error())
	}
	if _, loadErr := cliauth.NewStoreAt(dir).Load(); !errors.Is(loadErr, cliauth.ErrNoCredentials) {
		t.Errorf("MFA challenge must persist nothing, load returned %v", loadErr)
	}
}

// --- refresh ---------------------------------------------------------------

func TestRefreshSuccessRotatesAccessToken(t *testing.T) {
	root, out, dir := newTestRoot(t)
	newAccess := "rotated-access-token"
	srv := jsonServer(t, http.StatusOK, map[string]any{
		"success":      true,
		"access_token": newAccess,
	})
	defer srv.Close()

	seedCredentials(t, dir, srv.URL, true)

	if err := runAuth(t, root, "", "refresh"); err != nil {
		t.Fatalf("auth refresh: %v", err)
	}

	creds := storedCredentials(t, dir)
	if creds.AccessToken != newAccess {
		t.Errorf("access token not rotated, still %q", creds.AccessToken)
	}
	if creds.RefreshToken != testRefrsh {
		t.Error("refresh token must be retained across an access-token refresh")
	}
	if strings.Contains(out.String(), newAccess) || strings.Contains(out.String(), testRefrsh) {
		t.Errorf("command output leaked tokens: %q", out.String())
	}
}

func TestRefreshExpiryClearsCredentials(t *testing.T) {
	root, _, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusUnauthorized, map[string]any{
		"success": false,
		"error":   "Invalid refresh token",
	})
	defer srv.Close()

	seedCredentials(t, dir, srv.URL, true)

	err := runAuth(t, root, "", "refresh")
	if !errors.Is(err, ErrRefreshExpired) {
		t.Errorf("error = %v, want ErrRefreshExpired", err)
	}
	if _, loadErr := cliauth.NewStoreAt(dir).Load(); !errors.Is(loadErr, cliauth.ErrNoCredentials) {
		t.Errorf("expired refresh must clear credentials, load returned %v", loadErr)
	}
}

// --- auto-refresh wrapper ---------------------------------------------------

// flowServer scripts GET /api/whoami and POST /api/auth/refresh and records
// the Authorization header observed on every whoami call.
type flowServer struct {
	srv      *httptest.Server
	authSeen []string
	gets     int
	refresh  int
}

func newFlowServer(t *testing.T, whoamiStatuses []int, refreshStatus int, refreshBody map[string]any) *flowServer {
	t.Helper()
	flow := &flowServer{}
	flow.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/whoami":
			status := whoamiStatuses[min(flow.gets, len(whoamiStatuses)-1)]
			flow.gets++
			flow.authSeen = append(flow.authSeen, r.Header.Get("Authorization"))
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
		case r.Method == http.MethodPost && r.URL.Path == "/api/auth/refresh":
			flow.refresh++
			w.WriteHeader(refreshStatus)
			_ = json.NewEncoder(w).Encode(refreshBody)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(flow.srv.Close)
	return flow
}

func whoamiCall(ctx context.Context) func(c *client.Client) (*client.Response, error) {
	return func(c *client.Client) (*client.Response, error) {
		return c.Do(ctx, http.MethodGet, "/api/whoami", nil, client.RequestOptions{})
	}
}

func TestDoWithRefreshRetriesOnceAfterRefreshing(t *testing.T) {
	root, _, dir := newTestRoot(t)
	flow := newFlowServer(t,
		[]int{http.StatusUnauthorized, http.StatusOK},
		http.StatusOK,
		map[string]any{"success": true, "access_token": "rotated-access-token"},
	)

	seedCredentials(t, dir, flow.srv.URL, true)

	resp, err := DoWithRefresh(context.Background(), root, whoamiCall(context.Background()))
	if err != nil {
		t.Fatalf("DoWithRefresh: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("final status = %d, want 200", resp.StatusCode)
	}

	// First attempt used the old token, the retry used the rotated one.
	want := []string{"Bearer " + testAccess, "Bearer rotated-access-token"}
	if len(flow.authSeen) != 2 || flow.authSeen[0] != want[0] || flow.authSeen[1] != want[1] {
		t.Errorf("Authorization headers = %v, want %v", flow.authSeen, want)
	}
	if flow.refresh != 1 {
		t.Errorf("refresh calls = %d, want exactly 1", flow.refresh)
	}

	if creds := storedCredentials(t, dir); creds.AccessToken != "rotated-access-token" {
		t.Errorf("rotated token not persisted, stored %q", creds.AccessToken)
	}
}

func TestDoWithRefreshClearsCredentialsWhenRefreshRejected(t *testing.T) {
	root, _, dir := newTestRoot(t)
	flow := newFlowServer(t,
		[]int{http.StatusUnauthorized},
		http.StatusUnauthorized,
		map[string]any{"success": false, "error": "Invalid refresh token"},
	)

	seedCredentials(t, dir, flow.srv.URL, true)

	_, err := DoWithRefresh(context.Background(), root, whoamiCall(context.Background()))
	if !errors.Is(err, ErrRefreshExpired) {
		t.Errorf("error = %v, want ErrRefreshExpired", err)
	}
	if flow.refresh != 1 || flow.gets != 1 {
		t.Errorf("expected 1 call + 1 refresh with no retry, got gets=%d refresh=%d", flow.gets, flow.refresh)
	}
	if _, loadErr := cliauth.NewStoreAt(dir).Load(); !errors.Is(loadErr, cliauth.ErrNoCredentials) {
		t.Errorf("rejected refresh must clear credentials, load returned %v", loadErr)
	}
}

// With a stored access token but no refresh token, a 401 cannot be remediated
// by a refresh: the wrapper must surface the typed remediation error (same
// remediation as the no-credentials path) instead of a raw 401 HTTPError, and
// it must never attempt a refresh.
func TestDoWithRefreshWithoutRefreshTokenDoesNotRetry(t *testing.T) {
	root, _, dir := newTestRoot(t)
	flow := newFlowServer(t,
		[]int{http.StatusUnauthorized},
		http.StatusOK,
		map[string]any{"success": true, "access_token": "unused"},
	)

	seedCredentials(t, dir, flow.srv.URL, false) // no refresh token

	_, err := DoWithRefresh(context.Background(), root, whoamiCall(context.Background()))
	if !errors.Is(err, ErrStoredSessionRejected) {
		t.Errorf("error = %v, want ErrStoredSessionRejected", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
	if flow.refresh != 0 || flow.gets != 1 {
		t.Errorf("no refresh token stored: expected a single call, got gets=%d refresh=%d", flow.gets, flow.refresh)
	}
}

func TestDoWithRefreshTokenFlagOverrideSkipsStoredCredentials(t *testing.T) {
	root, _, dir := newTestRoot(t)
	flow := newFlowServer(t,
		[]int{http.StatusOK},
		http.StatusOK,
		map[string]any{"success": true, "access_token": "unused"},
	)

	// Stored credentials point at a server the test never starts: if the
	// wrapper used them, the request would not reach the flow server.
	seedCredentials(t, dir, "http://not-the-test-server.invalid", true)
	t.Setenv("RADAS_API_URL", flow.srv.URL)

	// The --token flag (the CI path) must win over stored credentials.
	root, _, _ = newTestRoot(t)
	t.Setenv("RADAS_CONFIG_DIR", dir)
	if err := root.PersistentFlags().Set(config.FlagToken, "ci-override-token"); err != nil {
		t.Fatalf("set --token flag: %v", err)
	}

	_, err := DoWithRefresh(context.Background(), root, whoamiCall(context.Background()))
	if err != nil {
		t.Fatalf("DoWithRefresh with --token override: %v", err)
	}
	if len(flow.authSeen) != 1 || flow.authSeen[0] != "Bearer ci-override-token" {
		t.Errorf("Authorization headers = %v, want [Bearer ci-override-token]", flow.authSeen)
	}
}

// --- status -----------------------------------------------------------------

func TestStatusShowsMetadataNeverTokens(t *testing.T) {
	root, out, dir := newTestRoot(t)

	seedCredentials(t, dir, "http://localhost:5001", true)

	if err := runAuth(t, root, "", "status"); err != nil {
		t.Fatalf("auth status: %v", err)
	}

	got := out.String()
	for _, want := range []string{"http://localhost:5001", testUser, "stored credentials"} {
		if !strings.Contains(got, want) {
			t.Errorf("status output missing %q, got %q", want, got)
		}
	}
	for _, secret := range []string{testAccess, testRefrsh} {
		if strings.Contains(got, secret) {
			t.Errorf("status output leaked %q", secret)
		}
	}
}

func TestStatusWithoutCredentials(t *testing.T) {
	root, out, _ := newTestRoot(t)

	if err := runAuth(t, root, "", "status"); err != nil {
		t.Fatalf("auth status without credentials should report, not fail: %v", err)
	}
	if !strings.Contains(out.String(), "Not logged in") {
		t.Errorf("status output should say the user is not logged in, got %q", out.String())
	}
}

// --- logout -----------------------------------------------------------------

func TestLogoutRevokesAndClearsCredentials(t *testing.T) {
	root, out, dir := newTestRoot(t)
	var authHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "message": "Logged out"})
	}))
	defer srv.Close()

	seedCredentials(t, dir, srv.URL, true)

	if err := runAuth(t, root, "", "logout"); err != nil {
		t.Fatalf("auth logout: %v", err)
	}

	if authHeader != "Bearer "+testAccess {
		t.Errorf("logout presented Authorization = %q", authHeader)
	}
	if _, loadErr := cliauth.NewStoreAt(dir).Load(); !errors.Is(loadErr, cliauth.ErrNoCredentials) {
		t.Errorf("logout must clear stored credentials, load returned %v", loadErr)
	}
	for _, secret := range []string{testAccess, testRefrsh} {
		if strings.Contains(out.String(), secret) {
			t.Errorf("logout output leaked %q", secret)
		}
	}
}

func TestLogoutAlreadyRevokedStillClearsLocally(t *testing.T) {
	root, _, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusUnauthorized, map[string]any{
		"success": false,
		"error":   "Authentication required",
	})
	defer srv.Close()

	seedCredentials(t, dir, srv.URL, false)

	if err := runAuth(t, root, "", "logout"); err != nil {
		t.Fatalf("logout against a rejecting server must succeed locally: %v", err)
	}
	if _, loadErr := cliauth.NewStoreAt(dir).Load(); !errors.Is(loadErr, cliauth.ErrNoCredentials) {
		t.Errorf("logout must clear stored credentials, load returned %v", loadErr)
	}
}

func TestLogoutWithoutCredentials(t *testing.T) {
	root, out, _ := newTestRoot(t)

	if err := runAuth(t, root, "", "logout"); err != nil {
		t.Fatalf("auth logout without credentials should be a friendly no-op: %v", err)
	}
	if !strings.Contains(out.String(), "Not logged in") {
		t.Errorf("expected a not-logged-in message, got %q", out.String())
	}
}

// --- non-interactive stdin --------------------------------------------------

func TestLoginReadsPipedCredentials(t *testing.T) {
	root, _, dir := newTestRoot(t)
	srv := jsonServer(t, http.StatusOK, map[string]any{
		"success":       true,
		"access_token":  testAccess,
		"refresh_token": testRefrsh,
		"user":          map[string]any{"username": testUser},
	})
	defer srv.Close()

	if err := runAuth(t, root, testUser+"\n"+testPass+"\n", "login", "--api-url", srv.URL); err != nil {
		t.Fatalf("piped login: %v", err)
	}
	if creds := storedCredentials(t, dir); creds.Username != testUser {
		t.Errorf("username = %q, want %q", creds.Username, testUser)
	}
}

func TestLoginRejectsPasswordOnArgv(t *testing.T) {
	// Design invariant: credentials must never be accepted as command-line
	// arguments (shell history exposure). Login defines no such flags.
	for _, name := range []string{"password", "access-token", "refresh-token", "token-arg"} {
		if loginCmd.Flags().Lookup(name) != nil {
			t.Errorf("login must not define a --%s flag", name)
		}
	}
}
