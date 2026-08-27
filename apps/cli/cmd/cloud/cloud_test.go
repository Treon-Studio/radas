package cloud

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// runCloud executes a cloud subcommand with the runtime configuration pointed
// at srvURL ("" keeps the built-in default) and returns the combined cobra and
// stdout output together with the command error.
func runCloud(t *testing.T, srvURL string, args ...string) (string, error) {
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

func TestCloudProbeIsExplicitFailureNotFakeRemoteState(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "probe", "aws")
	if err == nil {
		t.Fatal("cloud probe must fail explicitly until it is wired to the control plane")
	}
	if strings.Contains(out, "Authentication OK") || strings.Contains(out, "Permissions OK") || strings.Contains(out, "Latency") {
		t.Errorf("fabricated probe success printed:\n%s", out)
	}
	if hits != 0 {
		t.Errorf("probe called the server %d time(s); unwired commands must not invent calls", hits)
	}
}

func TestCloudInventoryIsExplicitFailureNotFakeRemoteState(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "inventory")
	if err == nil {
		t.Fatal("cloud inventory must fail explicitly until it is wired to the control plane")
	}
	for _, fake := range []string{"vpc-0a1b2c3d", "vol-99887766", "i-0987654321", "MANAGED"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated inventory row %q printed:\n%s", fake, out)
		}
	}
	if hits != 0 {
		t.Errorf("inventory called the server %d time(s); unwired commands must not invent calls", hits)
	}
}

// TestCloudInventoryErrorMessageIsFactual pins the not-wired message to the
// real control-plane surface: inventory is served per stack at
// GET /api/cloud/stacks/<name>/inventory (project-scoped, no BYOC account
// needed), with per-account BYOC inventory as a separate flow. The old text
// wrongly claimed inventory is only served per registered BYOC account.
func TestCloudInventoryErrorMessageIsFactual(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	_, err := runCloud(t, srv.URL, "inventory")
	if err == nil {
		t.Fatal("cloud inventory must fail until a stack/account selector is wired (Task 2.4)")
	}
	if hits != 0 {
		t.Errorf("unwired inventory must not call the server, got %d hit(s)", hits)
	}
	if !strings.Contains(err.Error(), "/api/cloud/stacks/<name>/inventory") {
		t.Errorf("error must point at the real per-stack inventory endpoint:\n%v", err)
	}
	if !strings.Contains(err.Error(), "no server call") {
		t.Errorf("unwired command must be labeled as making no server call:\n%v", err)
	}
	if strings.Contains(err.Error(), "requires a registered BYOC account and is served per account") {
		t.Errorf("error must not claim per-account BYOC is the only inventory path:\n%v", err)
	}
}

func TestCloudImportIsExplicitlyLocal(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "import", "aws_vpc", "module.vpc.aws_vpc.main", "vpc-123")
	if err != nil {
		t.Fatalf("cloud import: %v", err)
	}
	if hits != 0 {
		t.Errorf("import must stay local, but the server was hit %d time(s)", hits)
	}
	if !strings.Contains(out, "local") {
		t.Errorf("local generation must be labeled as local:\n%s", out)
	}
	if !strings.Contains(out, "module.vpc.aws_vpc.main") {
		t.Errorf("generated import block missing from output:\n%s", out)
	}
}

func TestCloudDiffWiredToStackDrift(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/cloud/stacks/prod-vpc/drift" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"enabled": true, "status": "in_sync", "last_run_id": "run-9",
		})
	}))
	defer srv.Close()

	out, err := runCloud(t, srv.URL, "diff", "prod-vpc")
	if err != nil {
		t.Fatalf("cloud diff: %v", err)
	}
	if !strings.Contains(out, "in_sync") {
		t.Errorf("server drift status missing from output:\n%s", out)
	}
}

func TestCloudDiffFailureNeverClaimsZeroDrift(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"boom"}`)
		out, err := runCloud(t, srv.URL, "diff", "prod-vpc")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		if strings.Contains(out, "14/14") || strings.Contains(out, "Zero out-of-band drifts") || strings.Contains(out, "in sync") {
			t.Errorf("status %d: fabricated drift-free claim printed:\n%s", code, out)
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}
