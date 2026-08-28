package audit

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	cmdauth "github.com/raizora/radas/v4/cmd/auth"
	cliauth "github.com/raizora/radas/v4/internal/auth"
)

// runAudit executes an audit subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runAudit(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()
	return runAuditEnv(t, srvURL, nil, args...)
}

// runAuditEnv executes an audit subcommand with isolated runtime
// configuration. When creds is non-nil it is seeded into the CLI credential
// store so the command must authenticate from stored credentials
// (RADAS_TOKEN stays empty); otherwise no credentials exist at all.
func runAuditEnv(t *testing.T, srvURL string, creds *cliauth.Credentials, args ...string) (string, error) {
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
	for _, code := range []int{http.StatusNotFound, http.StatusInternalServerError} {
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

// With no stored credentials and no RADAS_TOKEN, a 401 must surface as the
// typed not-authenticated error that tells the user how to fix it.
func TestAuditListWithoutCredentialsSurfacesNotAuthenticated(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	defer srv.Close()

	_, err := runAudit(t, srv.URL, "list")
	if !errors.Is(err, cmdauth.ErrNotAuthenticated) {
		t.Fatalf("error = %v, want cmdauth.ErrNotAuthenticated", err)
	}
	if !strings.Contains(err.Error(), "radas auth login") {
		t.Errorf("error must point at 'radas auth login', got %q", err.Error())
	}
}

// The export path must also authenticate from stored credentials.
func TestAuditExportAuthenticatesFromStoredCredentials(t *testing.T) {
	var (
		gotAuth  string
		authSeen int
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		authSeen++
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("id,actor_user_id,action\nev-1,admin,stack.apply\n"))
	}))
	defer srv.Close()

	creds := &cliauth.Credentials{AccessToken: "stored-access-token", Username: "alice"}
	out, err := runAuditEnv(t, srv.URL, creds, "export", "--format", "csv", "--out", "creds.csv")
	if err != nil {
		t.Fatalf("audit export with stored credentials: %v", err)
	}
	if authSeen != 1 {
		t.Fatalf("server calls = %d, want 1", authSeen)
	}
	if gotAuth != "Bearer stored-access-token" {
		t.Errorf("Authorization = %q, want the stored access token as bearer", gotAuth)
	}
	if !strings.Contains(out, "1 records from the server") {
		t.Errorf("expected the single CSV record counted (header excluded), got:\n%s", out)
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

// The server's CSV export always writes a header row first; the reported
// record count must not count that header as a record.
func TestAuditExportCSVCountExcludesHeaderRow(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("id,actor_user_id,action,created_at\n" +
			"ev-1,admin,stack.apply,2026-08-27T10:00:00Z\n" +
			"ev-2,admin,stack.destroy,2026-08-27T11:00:00Z\n"))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "export", "--format", "csv", "--out", "count.csv")
	if err != nil {
		t.Fatalf("audit export: %v", err)
	}
	if !strings.Contains(out, "2 records from the server") {
		t.Errorf("CSV count must exclude the header row (2 records), got:\n%s", out)
	}
}

// Quoted CSV fields may contain newlines; they are part of one record, not
// extra records.
func TestAuditExportCSVCountHandlesQuotedNewlines(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("id,actor_user_id,action,meta\n" +
			"ev-1,admin,stack.apply,\"line one\nline two\"\n" +
			"ev-2,admin,stack.destroy,\n"))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "export", "--format", "csv", "--out", "quoted.csv")
	if err != nil {
		t.Fatalf("audit export: %v", err)
	}
	if !strings.Contains(out, "2 records from the server") {
		t.Errorf("quoted newlines must not inflate the record count, got:\n%s", out)
	}
}

// A header-only CSV export contains zero records.
func TestAuditExportCSVHeaderOnlyCountsZeroRecords(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("id,actor_user_id,action,created_at\n"))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "export", "--format", "csv", "--out", "empty.csv")
	if err != nil {
		t.Fatalf("audit export: %v", err)
	}
	if !strings.Contains(out, "0 records from the server") {
		t.Errorf("header-only CSV must report 0 records, got:\n%s", out)
	}
}

// JSONL exports are newline-delimited objects: every non-empty line is a record.
func TestAuditExportJSONLCountsRecords(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/x-ndjson")
		_, _ = w.Write([]byte("{\"id\": \"ev-1\", \"action\": \"a\"}\n{\"id\": \"ev-2\", \"action\": \"b\"}\n"))
	}))
	defer srv.Close()

	out, err := runAudit(t, srv.URL, "export", "--format", "jsonl", "--out", "count.jsonl")
	if err != nil {
		t.Fatalf("audit export: %v", err)
	}
	if !strings.Contains(out, "2 records from the server") {
		t.Errorf("JSONL count must equal the number of lines, got:\n%s", out)
	}
}

// /api/audit-log is project-scoped (X-Project-Id is required by the server);
// the command must send the selected project's context.
func TestAuditListSendsProjectContextHeader(t *testing.T) {
	var gotProject string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotProject = r.Header.Get("X-Project-Id")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success": true, "entries": [], "count": 0}`))
	}))
	defer srv.Close()

	if _, err := runAudit(t, srv.URL, "list"); err != nil {
		t.Fatalf("audit list: %v", err)
	}
	if gotProject != "proj-1" {
		t.Errorf("X-Project-Id = %q, want proj-1 (the server rejects /api/audit-log without it)", gotProject)
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
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
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
