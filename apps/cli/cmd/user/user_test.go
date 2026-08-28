package user

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	cmdauth "github.com/raizora/radas/v4/cmd/auth"
	cliauth "github.com/raizora/radas/v4/internal/auth"
)

// runUser executes a user subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with
// the command error.
func runUser(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runUserEnv(t, srvURL, nil, args...)
}

// runUserEnv executes a user subcommand with isolated runtime configuration.
// When creds is non-nil it is seeded into the CLI credential store so the
// command must authenticate from stored credentials (RADAS_TOKEN stays
// empty); otherwise no credentials exist at all.
func runUserEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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

func TestUserListUsesServerUsers(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"users": []map[string]any{{
				"id": "usr-1", "email": "alice@corp.io", "username": "alice",
				"is_active": true, "role_names": []string{"developer"},
			}},
		})
	}))
	defer srv.Close()

	out, err := runUser(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("user list: %v", err)
	}
	if gotPath != "/api/users" {
		t.Errorf("user list must use GET /api/users, got %s", gotPath)
	}
	if !strings.Contains(out, "alice@corp.io") || !strings.Contains(out, "developer") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
}

func TestUserListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runUser(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"usr-001", "usr-002", "usr-003", "admin@corp.io", "bob@corp.io"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: fabricated fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it, not as a
// raw HTTP failure.
func TestUserListWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	out, err := runUser(t, srv.URL, "list")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
	if strings.Contains(out, "usr-001") {
		t.Errorf("fabricated rows printed on 401:\n%s", out)
	}
}

// The adapter must authenticate from the credentials stored by
// `radas auth login` when no --token/RADAS_TOKEN override is present.
func TestUserListAuthenticatesFromStoredCredentials(t *testing.T) {
	var (
		gotAuth  string
		authSeen int
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		authSeen++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "users": []}`))
	}))
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runUserEnv(t, srv.URL, creds, "list"); err != nil {
		t.Fatalf("user list with stored credentials: %v", err)
	}
	if authSeen != 1 {
		t.Fatalf("server calls = %d, want 1", authSeen)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

// An expired stored access token with a valid refresh token must transparently
// refresh once and retry; the rotated token is persisted for the next command.
func TestUserInviteAutoRefreshesExpiredAccessToken(t *testing.T) {
	var (
		inviteAuths []string
		invites     int
		refreshes   int
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/users/invites":
			invites++
			inviteAuths = append(inviteAuths, r.Header.Get("Authorization"))
			if invites == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error": "token expired"}`))
				return
			}
			_, _ = w.Write([]byte(`{"success": true, "invite": {"token": "real-token-abc", "email": "newuser@corp.io", "status": "pending"}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/auth/refresh":
			refreshes++
			_, _ = w.Write([]byte(`{"success": true, "access_token": "rotated-access-token"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "expired-access-token", RefreshToken: "valid-refresh-token", Username: "alice"}
	out, err := runUserEnv(t, srv.URL, creds, "invite", "newuser@corp.io", "-r", "developer")
	if err != nil {
		t.Fatalf("user invite with auto-refresh: %v", out)
	}
	if invites != 2 || refreshes != 1 {
		t.Fatalf("expected 1 expired call + 1 refresh + 1 retry, got invites=%d refreshes=%d", invites, refreshes)
	}
	want := []string{"Bearer expired-access-token", "Bearer rotated-access-token"}
	if len(inviteAuths) != 2 || inviteAuths[0] != want[0] || inviteAuths[1] != want[1] {
		t.Errorf("Authorization headers = %v (values withheld if unexpected), want expired then rotated", []string{redactBearer(inviteAuths, 0), redactBearer(inviteAuths, 1)})
	}
	if !strings.Contains(out, "real-token-abc") {
		t.Errorf("retry after refresh must complete the invite:\n%s", out)
	}

	// The rotated access token is persisted so the next command starts fresh.
	stored, err := cliauth.NewStoreAt(os.Getenv("RADAS_CONFIG_DIR")).Load()
	if err != nil {
		t.Fatalf("reload credentials: %v", err)
	}
	if stored.AccessToken != "rotated-access-token" {
		t.Error("rotated access token was not persisted")
	}
}

// redactBearer keeps failure output free of bearer material: it renders a
// known token as itself and anything else as a placeholder.
func redactBearer(headers []string, i int) string {
	known := map[string]string{
		"Bearer expired-access-token": "Bearer <expired>",
		"Bearer rotated-access-token": "Bearer <rotated>",
	}
	if i < len(headers) {
		if v, ok := known[headers[i]]; ok {
			return v
		}
	}
	return "Bearer <unexpected>"
}

func TestUserListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"success": true, "users": []}`)
	defer srv.Close()

	out, err := runUser(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("user list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No team members found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestUserInvitePostsToInvitesRouteWithRolesArray(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotBody   map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "invite": {"token": "real-token-abc", "email": "newuser@corp.io", "status": "pending", "expires_at": 1790000000.0}}`))
	}))
	defer srv.Close()

	out, err := runUser(t, srv.URL, "invite", "newuser@corp.io", "-r", "developer")
	if err != nil {
		t.Fatalf("user invite: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/users/invites" {
		t.Errorf("unexpected call %s %s (must be POST /api/users/invites)", gotMethod, gotPath)
	}
	if gotBody["email"] != "newuser@corp.io" {
		t.Errorf("payload email = %v", gotBody["email"])
	}
	roles, ok := gotBody["roles"].([]any)
	if !ok || len(roles) != 1 || roles[0] != "developer" {
		t.Errorf("payload roles must be a [\"developer\"] array, got %v", gotBody["roles"])
	}
	if !strings.Contains(out, "real-token-abc") {
		t.Errorf("the real invite token must be printed, got:\n%s", out)
	}
	if strings.Contains(out, "inv_9a8b7c6d5e") || strings.Contains(out, "radas.internal") {
		t.Errorf("fabricated invite link must not be printed:\n%s", out)
	}
}

func TestUserInviteServerErrorNeverFabricatesLink(t *testing.T) {
	for _, code := range []int{http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runUser(t, srv.URL, "invite", "newuser@corp.io")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"Invitation generated", "invite link", "inv_9a8b7c6d5e", "https://"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: fabricated invite text %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

// Mutations must carry the selected project's context and an idempotency key
// so the server can scope and deduplicate the request.
func TestUserMutationsSendProjectAndIdempotencyHeaders(t *testing.T) {
	t.Run("invite", func(t *testing.T) {
		var (
			gotProject string
			gotIdemKey string
		)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotProject = r.Header.Get("X-Project-Id")
			gotIdemKey = r.Header.Get("Idempotency-Key")
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"success": true, "invite": {"token": "t", "status": "pending"}}`))
		}))
		defer srv.Close()

		if _, err := runUser(t, srv.URL, "invite", "newuser@corp.io"); err != nil {
			t.Fatalf("user invite: %v", err)
		}
		if gotProject != "proj-1" {
			t.Errorf("X-Project-Id = %q, want proj-1", gotProject)
		}
		if gotIdemKey == "" {
			t.Error("Idempotency-Key header missing on invite")
		}
	})

	t.Run("deactivate", func(t *testing.T) {
		var (
			gotProject string
			gotIdemKey string
		)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotProject = r.Header.Get("X-Project-Id")
			gotIdemKey = r.Header.Get("Idempotency-Key")
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"success": true, "user": {"id": "usr-002", "is_active": false}}`))
		}))
		defer srv.Close()

		if _, err := runUser(t, srv.URL, "deactivate", "usr-002"); err != nil {
			t.Fatalf("user deactivate: %v", err)
		}
		if gotProject != "proj-1" {
			t.Errorf("X-Project-Id = %q, want proj-1", gotProject)
		}
		if gotIdemKey == "" {
			t.Error("Idempotency-Key header missing on deactivate")
		}
	})
}

func TestUserDeactivateSendsIsActiveFalse(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotBody   map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "user": {"id": "usr-002", "is_active": false}}`))
	}))
	defer srv.Close()

	out, err := runUser(t, srv.URL, "deactivate", "usr-002")
	if err != nil {
		t.Fatalf("user deactivate: %v", err)
	}
	if gotMethod != http.MethodPut || gotPath != "/api/users/usr-002" {
		t.Errorf("unexpected call %s %s (must be PUT /api/users/<id>)", gotMethod, gotPath)
	}
	if gotBody["is_active"] != false {
		t.Errorf("payload is_active must be false, got %v", gotBody["is_active"])
	}
	if !strings.Contains(out, "deactivated") {
		t.Errorf("expected success text after 2xx:\n%s", out)
	}
}

func TestUserDeactivateServerErrorNeverPrintsSuccess(t *testing.T) {
	srv := statusServer(t, http.StatusNotFound, `{"success": false, "error": "User not found"}`)
	out, err := runUser(t, srv.URL, "deactivate", "usr-404")
	srv.Close()

	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "has been deactivated") {
		t.Errorf("fake success printed on failure:\n%s", out)
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestUserRevokeSessionsFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runUser(t, srv.URL, "revoke-sessions", "usr-002")
	if err == nil {
		t.Fatal("user revoke-sessions must fail explicitly (no per-user route)")
	}
	if hit {
		t.Error("user revoke-sessions must not call the server")
	}
	if !strings.Contains(out, "not available") {
		t.Errorf("expected an explicit unavailability error, got:\n%s", out)
	}
	if strings.Contains(out, "have been invalidated") {
		t.Errorf("fabricated success must not be printed:\n%s", out)
	}
}
