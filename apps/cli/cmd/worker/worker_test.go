package worker

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runWorker executes a worker subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runWorker(t *testing.T, srvURL string, args ...string) (string, error) {
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

func TestWorkerListSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/admin/workers" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"workers": []map[string]any{{
				"id": "w-01", "name": "runner-sg1", "enabled": true,
				"lastSeenAt": 1735689600, "currentExecutionId": "exec-9",
			}},
		})
	}))
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("worker list: %v", err)
	}
	if !strings.Contains(out, "runner-sg1") {
		t.Errorf("worker row missing from output:\n%s", out)
	}
}

func TestWorkerListServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runWorker(t, srv.URL, "list")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"worker-node-01", "worker-node-02", "radas-runner-sg1"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: static fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestWorkerListEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"success": true, "workers": []}`)
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "list")
	if err != nil {
		t.Fatalf("worker list on empty server response: %v", err)
	}
	if !strings.Contains(out, "No workers registered") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

// TestWorkerDrainUnimplementedIsExplicitError proves drain never claims a
// remote state change: the control plane has no drain route, so the command
// fails explicitly without calling any endpoint.
func TestWorkerDrainUnimplementedIsExplicitError(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "drain", "worker-node-01")
	if err == nil {
		t.Fatal("worker drain must fail explicitly; the control plane has no drain route")
	}
	if strings.Contains(out, "✔") || strings.Contains(out, "DRAINING") {
		t.Errorf("fabricated drain success printed:\n%s", out)
	}
	if hits != 0 {
		t.Errorf("drain called the server %d time(s); unwired mutations must not invent calls", hits)
	}
}

func TestWorkerStatusWiredToQueue(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/queue" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"queued": []map[string]any{
				{"id": "exec-1", "runName": "prod-vpc/plan"},
				{"id": "exec-2", "runName": "staging/apply"},
			},
			"count": 2,
		})
	}))
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "status")
	if err != nil {
		t.Fatalf("worker status: %v", err)
	}
	if !strings.Contains(out, "2") || !strings.Contains(out, "exec-1") {
		t.Errorf("server queue data missing from output:\n%s", out)
	}
}

func TestWorkerStatusFailureNeverPrintsFakeHealth(t *testing.T) {
	srv := statusServer(t, http.StatusInternalServerError, `{"error":"boom"}`)
	defer srv.Close()

	out, err := runWorker(t, srv.URL, "status")
	if err == nil {
		t.Fatal("expected an error, got success exit")
	}
	if strings.Contains(out, "OPTIMAL") || strings.Contains(out, "Pending Jobs") {
		t.Errorf("fabricated queue health printed:\n%s", out)
	}
	if !strings.Contains(out, "request req-") {
		t.Errorf("error output must carry the request ID:\n%s", out)
	}
}
