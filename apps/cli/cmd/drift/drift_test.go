package drift

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runDrift executes a drift subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runDrift(t *testing.T, srvURL string, args ...string) (string, error) {
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

func TestDriftScanQueuesRealDriftCheck(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status": "queued", "stack": "prod-vpc", "run_id": "run-1"}`))
	}))
	defer srv.Close()

	out, err := runDrift(t, srv.URL, "scan", "prod-vpc")
	if err != nil {
		t.Fatalf("drift scan: %v", err)
	}
	if gotMethod != http.MethodPost || gotPath != "/api/cloud/stacks/prod-vpc/drift-check" {
		t.Errorf("unexpected call %s %s", gotMethod, gotPath)
	}
	if !strings.Contains(out, "queued") || !strings.Contains(out, "run-1") {
		t.Errorf("queued run details missing from output:\n%s", out)
	}
	for _, fake := range []string{"staging-k8s", "bytedc-db", "IN SYNC\t0"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated scan row %q printed:\n%s", fake, out)
		}
	}
}

func TestDriftScanRequiresStackAndSurfacesErrors(t *testing.T) {
	out, err := runDrift(t, "http://127.0.0.1:1", "scan")
	if err == nil {
		t.Fatal("drift scan without a stack must fail (no all-stacks route)")
	}
	if strings.Contains(out, "IN SYNC") {
		t.Errorf("fabricated scan table printed:\n%s", out)
	}

	srv := statusServer(t, http.StatusUnauthorized, `{"error":"boom"}`)
	out, err = runDrift(t, srv.URL, "scan", "prod-vpc")
	srv.Close()
	if err == nil {
		t.Fatal("expected an error on server failure")
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}

func TestDriftRemediateQueuesApplyAction(t *testing.T) {
	var (
		gotPath string
		gotBody map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"ok": true, "run_id": "run-2", "status": "QUEUED"}`))
	}))
	defer srv.Close()

	out, err := runDrift(t, srv.URL, "remediate", "prod-vpc")
	if err != nil {
		t.Fatalf("drift remediate: %v", err)
	}
	if gotPath != "/api/cloud/stacks/prod-vpc/actions" {
		t.Errorf("remediate must use POST /api/cloud/stacks/<name>/actions, got %s", gotPath)
	}
	if gotBody["action"] != "apply" {
		t.Errorf("remediate body action = %v, want apply", gotBody["action"])
	}
	if !strings.Contains(out, "queued") {
		t.Errorf("expected honest queued-run report:\n%s", out)
	}
	if strings.Contains(out, "0 changes needed") || strings.Contains(out, "reconciled to desired") {
		t.Errorf("fabricated reconciliation success printed:\n%s", out)
	}
}

func TestDriftScheduleGetAndPut(t *testing.T) {
	var (
		gotMethod string
		gotBody   map[string]any
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		if r.Method == http.MethodPut {
			_ = json.NewDecoder(r.Body).Decode(&gotBody)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"success": true, "stack": "prod-vpc", "schedule": {"enabled": true, "cron": "0 */6 * * *", "alert_on_drift": true}}`))
			return
		}
		_, _ = w.Write([]byte(`{"enabled": false, "cron": null, "alert_on_drift": true}`))
	}))
	defer srv.Close()

	out, err := runDrift(t, srv.URL, "schedule", "prod-vpc")
	if err != nil {
		t.Fatalf("drift schedule get: %v", err)
	}
	if gotMethod != http.MethodGet {
		t.Errorf("schedule without cron must GET, got %s", gotMethod)
	}
	if !strings.Contains(out, "enabled=false") {
		t.Errorf("expected current schedule rendered:\n%s", out)
	}

	out, err = runDrift(t, srv.URL, "schedule", "prod-vpc", "0 */6 * * *")
	if err != nil {
		t.Fatalf("drift schedule set: %v", err)
	}
	if gotMethod != http.MethodPut {
		t.Errorf("schedule with cron must PUT, got %s", gotMethod)
	}
	if gotBody["cron"] != "0 */6 * * *" || gotBody["enabled"] != true {
		t.Errorf("schedule payload = %v", gotBody)
	}
	if !strings.Contains(out, "server confirmed") {
		t.Errorf("expected server-confirmed success:\n%s", out)
	}
}
