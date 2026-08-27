package policy

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runPolicy executes a policy subcommand with the runtime configuration
// pointed at srvURL and returns the combined cobra and stdout output together
// with the command error.
func runPolicy(t *testing.T, srvURL string, args ...string) (string, error) {
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

func TestPolicyViolationsUsesControlPlaneRoute(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"count": 1,
			"violations": []map[string]any{{
				"id": "pv-1", "stack": "bytedc-db", "rule_id": "POL-ENC-01",
				"severity": "HIGH", "resource": "data_vol", "message": "Missing disk encryption flag",
			}},
		})
	}))
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "violations")
	if err != nil {
		t.Fatalf("policy violations: %v", err)
	}
	if gotPath != "/api/cloud/policy/violations" {
		t.Errorf("policy violations must use GET /api/cloud/policy/violations, got %s", gotPath)
	}
	if !strings.Contains(out, "POL-ENC-01") || !strings.Contains(out, "bytedc-db") {
		t.Errorf("server rows missing from output:\n%s", out)
	}
}

func TestPolicyViolationsServerErrorNeverPrintsFallbackRows(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runPolicy(t, srv.URL, "violations")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		for _, fake := range []string{"POL-ENC-01", "POL-TAG-04", "Missing disk encryption flag", "staging-k8s/node_pool"} {
			if strings.Contains(out, fake) {
				t.Errorf("status %d: fabricated fallback row %q printed:\n%s", code, fake, out)
			}
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestPolicyViolationsEmptyReportsEmpty(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"count": 0, "violations": []}`)
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "violations")
	if err != nil {
		t.Fatalf("policy violations on empty server response: %v", err)
	}
	if !strings.Contains(out, "No policy violations recorded") {
		t.Errorf("expected an explicit empty report, got:\n%s", out)
	}
}

func TestPolicyCheckFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "check", "prod-vpc")
	if err == nil {
		t.Fatal("policy check must fail explicitly (no evaluation route)")
	}
	if hit {
		t.Error("policy check must not call the server")
	}
	if !strings.Contains(out, "not available") {
		t.Errorf("expected an explicit unavailability error, got:\n%s", out)
	}
	for _, fake := range []string{"RULE-001", "3/3 rules passed", "PASSED"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated rule result %q printed:\n%s", fake, out)
		}
	}
}

func TestPolicyExemptFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runPolicy(t, srv.URL, "exempt", "POL-ENC-01", "bytedc-db")
	if err == nil {
		t.Fatal("policy exempt must fail explicitly (no exemption route)")
	}
	if hit {
		t.Error("policy exempt must not call the server")
	}
	if !strings.Contains(out, "not available") {
		t.Errorf("expected an explicit unavailability error, got:\n%s", out)
	}
	if strings.Contains(out, "Exemption granted") {
		t.Errorf("fabricated exemption success must not be printed:\n%s", out)
	}
}
