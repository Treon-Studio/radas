package audit

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runAudit executes an audit subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runAudit(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "proj-1")
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())
	tmp := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

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

func entriesBody(entries ...map[string]any) string {
	return `{"success": true, "entries": ` + jsonString(entries) + `, "count": ` + fmt.Sprint(len(entries)) + `}`
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestAuditListUsesAuditLogRoute(t *testing.T) {
	var (
		gotPath string
		gotRawq string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotRawq = r.URL.Path, r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(entriesBody(map[string]any{
			"id": "ev-1", "actor_user_id": "admin", "action": "stack.apply",
			"target_type": "stack", "target_id": "prod-vpc", "created_at": "2026-08-27T10:00:00Z",
		})))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("audit list: %v", err)
	}
	if gotPath != "/api/audit-log" {
		t.Errorf("audit list must use GET /api/audit-log, got %s", gotPath)
	}
	if strings.Contains(gotRawq, "action=") {
		t.Errorf("unfiltered list must not use the action filter, got %s", gotRawq)
	}
	if !strings.Contains(out, "stack.apply") || !strings.Contains(out, "prod-vpc") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
}

func TestAuditListWithActionUsesSearchRoute(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(entriesBody(map[string]any{
			"id": "ev-2", "actor_user_id": "admin", "action": "flag.toggle", "created_at": "2026-08-27T09:00:00Z",
		})))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "list", "-a", "flag.toggle")
	if err != nil {
		t.Fatalf("audit list -a: %v", err)
	}
	if gotPath != "/api/audit/search" {
		t.Errorf("action-filtered list must use GET /api/audit/search, got %s", gotPath)
	}
	if !strings.Contains(out, "flag.toggle") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
}

func TestAuditListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runAudit(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"dark-mode-v2", "stack.plan\tprod-vpc", "registry.install\ttofu-block/vpc-ha"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: fabricated fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestAuditListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"success": true, "entries": [], "count": 0}`)
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("audit list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No audit events found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestAuditExportWritesServerBody(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("id,actor_user_id,action\nev-1,admin,stack.apply\n"))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "export", "--format", "csv", "--out", "export-test.csv")
	if err != nil {
		t.Fatalf("audit export: %v", err)
	}
	if gotPath != "/api/audit-log/export" {
		t.Errorf("audit export must use GET /api/audit-log/export, got %s", gotPath)
	}
	data, err := os.ReadFile("export-test.csv")
	if err != nil {
		t.Fatalf("export file missing: %v", err)
	}
	if !strings.Contains(string(data), "ev-1") {
		t.Errorf("export file does not contain the server body: %q", string(data))
	}
	if !strings.Contains(out, "export-test.csv") {
		t.Errorf("expected the output path in the report:\n%s", out)
	}
}

func TestAuditExportServerErrorNeverFabricatesCount(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	out, err := runAudit(t, srv.URL, "export", "--out", "never.csv")
	srv.Close()

	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "successfully exported") || strings.Contains(out, "482") {
		t.Errorf("fabricated export success must not be printed:\n%s", out)
	}
	if _, statErr := os.Stat("never.csv"); statErr == nil {
		t.Error("no export file must be written when the server call fails")
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestAuditEvidencePrintsLiveComplianceReport(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"audit_30d": {}, "recent": [], "prod_stacks_without_approval": [],
			"mfa_users": 2,
			"scorecard": {"score": 80, "max": 100, "checks": [
				{"id": "quota", "label": "Project quota configured", "ok": true},
				{"id": "approval", "label": "Prod stacks require approval", "ok": false, "detail": "1 prod stack(s) without approval"}
			]}
		}`))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "evidence")
	if err != nil {
		t.Fatalf("audit evidence: %v", err)
	}
	if gotPath != "/api/compliance/report" {
		t.Errorf("audit evidence must use GET /api/compliance/report, got %s", gotPath)
	}
	if !strings.Contains(out, "PASS") || !strings.Contains(out, "Project quota configured") {
		t.Errorf("expected live scorecard checks in output:\n%s", out)
	}
	if !strings.Contains(out, "FAIL") || !strings.Contains(out, "Prod stacks require approval") {
		t.Errorf("expected failing check rendered honestly:\n%s", out)
	}
	for _, fake := range []string{"100% keys rotated", "compliance_evidence_report.pdf", "0 unauthorized applies"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated evidence claim %q printed:\n%s", fake, out)
		}
	}
}

func TestAuditEvidenceServerErrorNeverFabricates(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	out, err := runAudit(t, srv.URL, "evidence")
	srv.Close()

	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	for _, fake := range []string{"Secret rotation evidence", "compliance_evidence_report.pdf", "PASS"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated evidence claim %q printed on failure:\n%s", fake, out)
		}
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestAuditExportRejectsUnsupportedFormat(t *testing.T) {
	out, err := runAudit(t, "http://127.0.0.1:1", "export", "--format", "pdf")
	if err == nil {
		t.Fatal("expected a format validation error")
	}
	if !strings.Contains(out, "csv or jsonl") {
		t.Errorf("expected an explicit format error, got:\n%s", out)
	}
}
