package cost

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runCost executes a cost subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runCost(t *testing.T, srvURL string, args ...string) (string, error) {
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

func TestCostEstimateFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runCost(t, srv.URL, "estimate", "prod-vpc")
	if err == nil {
		t.Fatal("cost estimate must fail explicitly (no per-stack estimate route)")
	}
	if hit {
		t.Error("cost estimate must not call the server")
	}
	if !strings.Contains(out, "not yet available") || !strings.Contains(out, "prod-vpc") {
		t.Errorf("expected an explicit unavailability error naming the stack, got:\n%s", out)
	}
	for _, fake := range []string{"+$48.50", "$312.00", "Budget Status", "Monthly Delta"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated cost number %q printed:\n%s", fake, out)
		}
	}
}

func TestCostAnomaliesFailsExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runCost(t, srv.URL, "anomalies")
	if err == nil {
		t.Fatal("cost anomalies must fail explicitly (no anomalies route)")
	}
	if hit {
		t.Error("cost anomalies must not call the server")
	}
	for _, fake := range []string{"staging-k8s/nat-gateway", "bytedc-db/nvme-volume", "+$12.00/day"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated anomaly row %q printed:\n%s", fake, out)
		}
	}
}
