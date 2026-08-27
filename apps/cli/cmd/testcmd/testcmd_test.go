package testcmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runTest executes a test subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runTest(t *testing.T, srvURL string, args ...string) (string, error) {
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

func testCasesBody(cases ...map[string]any) string {
	b, _ := json.Marshal(cases)
	return `{"test_cases": ` + string(b) + `, "limit": 100, "offset": 0, "has_more": false}`
}

func TestTestListUsesControlPlaneRegistry(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(testCasesBody(map[string]any{
			"id": "tc-abc", "name": "Public CIDR closed", "kind": "tofu", "stack": "prod-vpc", "enabled": true,
		})))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("test list: %v", err)
	}
	if gotPath != "/api/tests" {
		t.Errorf("test list must use GET /api/tests, got %s", gotPath)
	}
	if !strings.Contains(out, "tc-abc") || !strings.Contains(out, "prod-vpc") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
	for _, fake := range []string{"vpc_cidr_block_valid.tftest.hcl", "nat_gateway_redundancy", "idempotency_check.yml"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated test row %q printed:\n%s", fake, out)
		}
	}
}

func TestTestListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"test_cases": [], "has_more": false}`)
	defer srv.Close()

	out, err := runTest(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("test list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No test cases registered") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestTestShowSelectsFromListAndFailsOnUnknown(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(testCasesBody(map[string]any{
			"id": "tc-abc", "name": "Public CIDR closed", "kind": "tofu", "stack": "prod-vpc", "enabled": true,
		})))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "show", "tc-abc")
	if err != nil {
		t.Fatalf("test show: %v", err)
	}
	if hits != 1 {
		t.Errorf("show must fetch the list exactly once, got %d hits", hits)
	}
	if !strings.Contains(out, "tc-abc") || !strings.Contains(out, "Public CIDR closed") {
		t.Errorf("expected the real test case rendered:\n%s", out)
	}
	if strings.Contains(out, "All 4 assertions satisfied") {
		t.Errorf("fabricated assertion detail printed:\n%s", out)
	}

	out, err = runTest(t, srv.URL, "show", "tc-nope")
	if err == nil {
		t.Fatal("expected an error for an unknown test id")
	}
	if !strings.Contains(out, "not found") {
		t.Errorf("expected an explicit not-found error, got:\n%s", out)
	}
}

func TestTestRunPostsToServerRunRoute(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"success": true, "result": {"status": "passed", "passed": true, "name": "Public CIDR closed", "severity": "blocker", "stack": "prod-vpc"}}`))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "run", "tc-abc")
	if err != nil {
		t.Fatalf("test run: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/tests/tc-abc/run" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(out, "PASSED") {
		t.Errorf("expected the real verdict in output:\n%s", out)
	}
	for _, fake := range []string{"All 3 test suites passed", "(14ms)", "(22ms)"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated run result %q printed:\n%s", fake, out)
		}
	}
}

func TestTestRunFailureSurfacesAndNeverPasses(t *testing.T) {
	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	out, err := runTest(t, srv.URL, "run", "tc-abc")
	srv.Close()

	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestTestRunFailedVerdictIsRendered(t *testing.T) {
	srv := statusServer(t, http.StatusCreated, `{"success": true, "result": {"status": "failed", "passed": false, "name": "Public CIDR closed", "severity": "blocker"}}`)
	defer srv.Close()

	out, err := runTest(t, srv.URL, "run", "tc-abc")
	if err != nil {
		t.Fatalf("test run (failed verdict is still a successful API call): %v", err)
	}
	if !strings.Contains(out, "FAILED") {
		t.Errorf("expected an honest FAILED verdict:\n%s", out)
	}
	if !strings.Contains(out, "blocker") {
		t.Errorf("expected severity to be shown for failures:\n%s", out)
	}
}

func TestTestIdempotencyFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "idempotency", "playbooks/main.yml")
	if err == nil {
		t.Fatal("test idempotency must fail explicitly")
	}
	if hit {
		t.Error("test idempotency must not call the server")
	}
	for _, fake := range []string{"VERIFIED", "changed=0", "Pass 2"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated idempotency result %q printed:\n%s", fake, out)
		}
	}
}

func TestTestScoreUsesControlPlaneScoreEndpoint(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.URL.Query().Get("stack") != "prod-vpc" {
			t.Errorf("expected stack query param, got %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"score": 87, "grade": "B", "total_tests": 5, "passed_tests": 4, "failed_tests": 1, "deductions": {"blocker": 0, "warning": 10, "info": 3}}`))
	}))
	defer srv.Close()

	out, err := runTest(t, srv.URL, "score", "prod-vpc")
	if err != nil {
		t.Fatalf("test score: %v", err)
	}
	if gotPath != "/api/test-cases/score" {
		t.Errorf("test score must use GET /api/test-cases/score, got %s", gotPath)
	}
	if !strings.Contains(out, "87") || !strings.Contains(out, "B") {
		t.Errorf("expected the real score in output:\n%s", out)
	}
	for _, fake := range []string{"96 / 100", "A+", "FinOps & Cost Accuracy"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated score line %q printed:\n%s", fake, out)
		}
	}
}
