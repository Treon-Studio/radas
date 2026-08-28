package secret

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// runSecret executes a secret subcommand with the runtime configuration
// pointed at srvURL (unused by local commands) and returns the combined cobra
// and stdout output together with the command error.
func runSecret(t *testing.T, srvURL string, args ...string) (string, error) {
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

func TestSecretScanFindsRealMatches(t *testing.T) {
	tmp := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	if err := os.WriteFile("secrets.tfvars", []byte("db_password = \"hunter2hunter2\"\nregion = \"us-east-1\"\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if err := os.WriteFile("clean.tfvars", []byte("instance_type = \"t3.micro\"\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	out, err := runSecret(t, "http://127.0.0.1:1", "scan", ".")
	if err == nil {
		t.Fatal("a scan with real findings must exit non-zero")
	}
	if !strings.Contains(out, "secrets.tfvars") || !strings.Contains(out, "1 credential-looking") {
		t.Errorf("expected the real finding to be reported:\n%s", out)
	}
	if strings.Contains(out, "0 secrets detected") || strings.Contains(out, "PASSED") {
		t.Errorf("fabricated clean-scan verdict printed despite findings:\n%s", out)
	}
	_ = filepath.Separator
}

func TestSecretScanCleanWorkspaceReportsZero(t *testing.T) {
	tmp := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })
	if err := os.WriteFile("clean.tfvars", []byte("instance_type = \"t3.micro\"\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	out, err := runSecret(t, "http://127.0.0.1:1", "scan", ".")
	if err != nil {
		t.Fatalf("clean workspace scan must succeed: %v", err)
	}
	if !strings.Contains(out, "0 credential-looking") {
		t.Errorf("expected an honest zero-finding report:\n%s", out)
	}
}

func TestSecretMutationsFailExplicitlyWithoutServerCall(t *testing.T) {
	var hit bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hit = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	for _, args := range [][]string{
		{"rotate", "key-1"},
		{"encrypt", "some.tfvars"},
		{"decrypt", "some.tfvars.enc"},
	} {
		out, err := runSecret(t, srv.URL, args...)
		if err == nil {
			t.Errorf("%v: expected an explicit unavailability error", args)
		}
		if strings.Contains(out, "successfully") || strings.Contains(out, "active") {
			t.Errorf("%v: fabricated success printed:\n%s", args, out)
		}
	}
	if hit {
		t.Error("secret mutation commands must not call the server")
	}
}
