package user

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runUser executes a user subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runUser(t *testing.T, srvURL string, args ...string) (string, error) {
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
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
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
	for _, code := range []int{http.StatusUnauthorized, http.StatusInternalServerError} {
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
