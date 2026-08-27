package stack

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runStack executes a stack subcommand with the runtime configuration pointed
// at srvURL ("" keeps the built-in default) and returns the combined cobra and
// stdout output together with the command error.
func runStack(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
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

func TestStackListSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/cloud/stacks" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"stacks": []map[string]any{
				{"id": "s1", "name": "alpha-vpc", "provider": "aws", "environment": "production", "status": "synced"},
			},
		})
	}))
	defer srv.Close()

	out, err := runStack(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("stack list: %v", err)
	}
	if !strings.Contains(out, "alpha-vpc") {
		t.Errorf("stack row missing from output:\n%s", out)
	}
}

func TestStackListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runStack(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"prod-vpc", "staging-k8s", "bytedc-db"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: static fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestStackListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"stacks": []}`)
	defer srv.Close()

	out, err := runStack(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("stack list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No stacks found") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
	if strings.Contains(out, "prod-vpc") {
		t.Errorf("static fallback rows printed on empty response:\n%s", out)
	}
}

func TestStackPlanQueuedOnSuccess(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/cloud/stacks/prod-vpc/actions" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok": true, "run_id": "run-42", "status": "queued",
			"message": "Queued. Waiting for a worker to claim this run.",
		})
	}))
	defer srv.Close()

	out, err := runStack(t, srv.URL, "plan", "prod-vpc")
	if err != nil {
		t.Fatalf("stack plan: %v", err)
	}
	if gotBody["action"] != "plan" {
		t.Errorf("request body action = %v, want plan", gotBody["action"])
	}
	if !strings.Contains(out, "run-42") {
		t.Errorf("queued run ID missing from output:\n%s", out)
	}
}

func TestStackPlanFailureNeverClaimsLocalPlan(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runStack(t, srv.URL, "plan", "prod-vpc")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		if strings.Contains(out, "Plan completed") || strings.Contains(out, "ready for apply") || strings.Contains(out, "✔") {
			t.Errorf("status %d: fabricated plan success printed:\n%s", code, out)
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestStackApplyQueuedOnSuccess(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/cloud/stacks/prod-vpc/actions" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok": true, "run_id": "run-77", "status": "queued", "message": "queued",
		})
	}))
	defer srv.Close()

	out, err := runStack(t, srv.URL, "apply", "prod-vpc")
	if err != nil {
		t.Fatalf("stack apply: %v", err)
	}
	if gotBody["action"] != "apply" {
		t.Errorf("request body action = %v, want apply", gotBody["action"])
	}
	if !strings.Contains(out, "run-77") {
		t.Errorf("queued run ID missing from output:\n%s", out)
	}
}

func TestStackApplyFailureNeverClaimsApplyComplete(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	defer srv.Close()

	out, err := runStack(t, srv.URL, "apply", "prod-vpc")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "Apply complete") || strings.Contains(out, "✔") {
		t.Errorf("fabricated apply success printed:\n%s", out)
	}
}

func TestStackStatusWiredToServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/cloud/stacks/prod-vpc" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"name":        "prod-vpc",
			"provider":    "aws",
			"meta":        map[string]any{"locked": map[string]any{"reason": "manual lock", "by": "ops", "at": 1720000000}},
			"locked":      true,
			"lock_reason": "manual lock",
			"drift":       map[string]any{"enabled": true, "status": "in_sync"},
		})
	}))
	defer srv.Close()

	out, err := runStack(t, srv.URL, "status", "prod-vpc")
	if err != nil {
		t.Fatalf("stack status: %v", err)
	}
	if !strings.Contains(out, "aws") || !strings.Contains(out, "in_sync") {
		t.Errorf("server-provided status fields missing from output:\n%s", out)
	}
}

// TestStackStatusDecodesRealServerContract asserts that `stack status`
// succeeds against the exact payload the real server returns for
// GET /api/cloud/stacks/<name> (services/cloud_provisioning.py stacks_get):
// locked is a bool, lock_reason is a plain string ("" when unlocked), and the
// structured lock object only lives inside meta. Regresses the decode
// mismatch where strict json.Unmarshal rejected every real response.
func TestStackStatusDecodesRealServerContract(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/cloud/stacks/prod-vpc" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"name": "prod-vpc",
			"path": "infra/stacks/prod-vpc",
			"files": ["backend.hcl", "main.tofu"],
			"terraform_tfvars": "env = \"production\"\n",
			"backend_hcl": "",
			"has_secrets": true,
			"meta": {"locked": {"reason": "change freeze", "by": "ops", "at": 1720000000}, "last_status": "applied"},
			"provider": "aws",
			"drift": {"enabled": true, "status": "in_sync", "last_run_id": "run-9", "last_checked_at": 1720000100, "returncode": 0, "run_status": "success"},
			"locked": true,
			"lock_reason": "change freeze",
			"outputs": {"vpc_id": "vpc-123"}
		}`))
	}))
	defer srv.Close()

	out, err := runStack(t, srv.URL, "status", "prod-vpc")
	if err != nil {
		t.Fatalf("stack status must decode the real server shape: %v", err)
	}
	if !strings.Contains(out, "Locked: true") {
		t.Errorf("locked state must be reported honestly:\n%s", out)
	}
	if !strings.Contains(out, "Lock Reason: change freeze") {
		t.Errorf("string lock_reason missing from output:\n%s", out)
	}
	if !strings.Contains(out, "in_sync") || !strings.Contains(out, "applied") {
		t.Errorf("drift/meta fields missing from output:\n%s", out)
	}
}

func TestStackStatusFailureNeverPrintsFakeSyncedState(t *testing.T) {
	srv := statusServer(t, http.StatusNotFound, `{"error":"Not found"}`)
	defer srv.Close()

	out, err := runStack(t, srv.URL, "status", "prod-vpc")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "SYNCED") || strings.Contains(out, "No drift detected") {
		t.Errorf("fabricated status output printed:\n%s", out)
	}
}
