package approval

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

// runApproval executes an approval subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runApproval(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runApprovalEnv(t, srvURL, nil, args...)
}

// runApprovalEnv executes an approval subcommand with isolated runtime
// configuration. When creds is non-nil it is seeded into the CLI credential
// store so the command must authenticate from stored credentials
// (RADAS_TOKEN stays empty); otherwise no credentials exist at all.
func runApprovalEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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

func TestApprovalListHitsRealRoute(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.Method != http.MethodGet {
			t.Errorf("unexpected method %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"approvals": []map[string]any{{
				"id": "appr-1", "stack": "prod-vpc", "action": "apply",
				"requested_by": "alice@corp.io", "status": "pending",
			}},
		})
	}))
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("approval list: %v", err)
	}
	if gotPath != "/api/approvals" {
		t.Errorf("approval list must use GET /api/approvals, got %s", gotPath)
	}
	if !strings.Contains(out, "appr-1") || !strings.Contains(out, "alice@corp.io") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
}

func TestApprovalListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runApproval(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"appr-9821a", "appr-3312c", "bytedc-db", "pending (1/2)"} {
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
// typed not-authenticated error that tells the user how to fix it.
func TestApprovalListWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runApproval(t, srv.URL, "list")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// The adapter must authenticate from the credentials stored by
// `radas auth login` when no --token/RADAS_TOKEN override is present.
func TestApprovalListAuthenticatesFromStoredCredentials(t *testing.T) {
	var (
		gotAuth  string
		authSeen int
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		authSeen++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"approvals": []}`))
	}))
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	if _, err := runApprovalEnv(t, srv.URL, creds, "list"); err != nil {
		t.Fatalf("approval list with stored credentials: %v", err)
	}
	if authSeen != 1 {
		t.Fatalf("server calls = %d, want 1", authSeen)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
}

func TestApprovalListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"approvals": []}`)
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("approval list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No approval requests found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestApprovalApprovePrintsSuccessOnlyAfterServerConfirmation(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotBody   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		gotBody = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "approval": {"id": "appr-1", "status": "approved"}}`))
	}))
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "approve", "appr-1")
	if err != nil {
		t.Fatalf("approval approve: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/approvals/appr-1/approve" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	// The server's approve handler consumes no request body (the decision is
	// in the path, the decider is the authenticated user): any {"action": ...}
	// or comment payload would be silently dropped, so none may be sent.
	if strings.TrimSpace(gotBody) != "" {
		t.Errorf("approve must send no body (the server ignores it), got %q", gotBody)
	}
	if !strings.Contains(out, "signed successfully") {
		t.Errorf("expected success text after 2xx:\n%s", out)
	}
	if strings.Contains(out, "Quorum condition reached") {
		t.Errorf("fabricated quorum text must not be printed:\n%s", out)
	}
}

// The approve/reject handlers ignore request bodies entirely, so a --comment
// flag that pretends to persist would be dishonest; it must not exist.
func TestApprovalApproveDefinesNoCommentFlag(t *testing.T) {
	if approveCmd.Flags().Lookup("comment") != nil {
		t.Error("approval approve must not define an inert --comment flag (the server never persists it)")
	}
	if rejectCmd.Flags().Lookup("reason") != nil {
		t.Error("approval reject must not define an inert --reason flag (the server never persists it)")
	}
}

func TestApprovalApproveServerErrorNeverPrintsSuccess(t *testing.T) {
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runApproval(t, srv.URL, "approve", "appr-1")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"signed successfully", "Quorum condition reached", "Execution unlocked"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: fake success text %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestApprovalRejectPrintsSuccessOnlyAfterServerConfirmation(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotBody   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		gotBody = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "approval": {"id": "appr-1", "status": "rejected"}}`))
	}))
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "reject", "appr-1")
	if err != nil {
		t.Fatalf("approval reject: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/approvals/appr-1/reject" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if strings.TrimSpace(gotBody) != "" {
		t.Errorf("reject must send no body (the server ignores it), got %q", gotBody)
	}
	if !strings.Contains(out, "rejected") {
		t.Errorf("expected success text after 2xx:\n%s", out)
	}
	if strings.Contains(out, "Reason logged") {
		t.Errorf("the control plane does not persist rejection reasons; the output must not claim it does:\n%s", out)
	}
}

// The list endpoint filters server-side via ?status= (approval_routes.py
// api_list_approvals passes it to list_approvals); the CLI must use the
// parameter, not filter rows locally after fetching everything.
func TestApprovalListPassesStatusFilterToServer(t *testing.T) {
	var gotRawQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRawQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"approvals": [{"id": "appr-1", "stack": "prod-vpc", "action": "apply", "status": "pending"}]}`))
	}))
	defer srv.Close()

	if _, err := runApproval(t, srv.URL, "list", "-s", "pending"); err != nil {
		t.Fatalf("approval list -s: %v", err)
	}
	if gotRawQuery != "status=pending" {
		t.Errorf("status filter must be sent server-side as ?status=pending, got %q", gotRawQuery)
	}
}

// Mutations must carry the project context and an idempotency key so the
// server can scope and (on replay) deduplicate the decision.
func TestApprovalMutationsSendProjectAndIdempotencyHeaders(t *testing.T) {
	for _, tc := range []struct {
		name string
		args []string
	}{
		{"approve", []string{"approve", "appr-1"}},
		{"reject", []string{"reject", "appr-1"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var (
				gotProject    string
				gotIdemKey    string
				gotAuthHeader string
			)
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotProject = r.Header.Get("X-Project-Id")
				gotIdemKey = r.Header.Get("Idempotency-Key")
				gotAuthHeader = r.Header.Get("Authorization")
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"success": true, "approval": {"id": "appr-1", "status": "ok"}}`))
			}))
			defer srv.Close()

			if _, err := runApproval(t, srv.URL, tc.args...); err != nil {
				t.Fatalf("approval %s: %v", tc.name, err)
			}
			if gotProject != "proj-1" {
				t.Errorf("X-Project-Id = %q, want proj-1 (project context on mutations)", gotProject)
			}
			if gotIdemKey == "" {
				t.Error("Idempotency-Key header missing on a mutation")
			}
			if gotAuthHeader != "" {
				t.Errorf("no credentials are configured; Authorization must be absent, got a header (value withheld)")
			}
		})
	}
}

func TestApprovalRejectServerErrorNeverPrintsSuccess(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	out, err := runApproval(t, srv.URL, "reject", "appr-1")
	srv.Close()

	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "✔") || strings.Contains(out, "Reason logged:") {
		t.Errorf("fake success output printed on failure:\n%s", out)
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestApprovalHistoryFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "history")
	if err == nil {
		t.Fatal("approval history must fail explicitly (no server route)")
	}
	if hit {
		t.Error("approval history must not call the server")
	}
	if !strings.Contains(out, "not available") {
		t.Errorf("expected an explicit unavailability error, got:\n%s", out)
	}
	if strings.Contains(out, "2026-08-23") {
		t.Errorf("fabricated history rows must not be printed:\n%s", out)
	}
}
