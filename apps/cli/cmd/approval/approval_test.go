package approval

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runApproval executes an approval subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runApproval(t *testing.T, srvURL string, args ...string) (string, error) {
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
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
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
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "approval": {"id": "appr-1", "status": "approved"}}`))
	}))
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "approve", "appr-1", "-m", "LGTM")
	if err != nil {
		t.Fatalf("approval approve: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/approvals/appr-1/approve" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(out, "signed successfully") {
		t.Errorf("expected success text after 2xx:\n%s", out)
	}
	if strings.Contains(out, "Quorum condition reached") {
		t.Errorf("fabricated quorum text must not be printed:\n%s", out)
	}
}

func TestApprovalApproveServerErrorNeverPrintsSuccess(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
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
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "approval": {"id": "appr-1", "status": "rejected"}}`))
	}))
	defer srv.Close()

	out, err := runApproval(t, srv.URL, "reject", "appr-1", "--reason", "Security review incomplete")
	if err != nil {
		t.Fatalf("approval reject: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/approvals/appr-1/reject" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(out, "rejected") {
		t.Errorf("expected success text after 2xx:\n%s", out)
	}
}

func TestApprovalRejectServerErrorNeverPrintsSuccess(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	out, err := runApproval(t, srv.URL, "reject", "appr-1", "--reason", "bad")
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
