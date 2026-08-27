package config

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func runEnvCmd(t *testing.T, args ...string) string {
	t.Helper()

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = w

	var buf strings.Builder
	EnvCmd.SetOut(&buf)
	EnvCmd.SetErr(&buf)
	EnvCmd.SetArgs(args)
	_ = EnvCmd.Execute()

	os.Stdout = old
	_ = w.Close()
	captured, _ := io.ReadAll(r)

	return buf.String() + string(captured)
}

func TestEnvCheckRunsRealProbes(t *testing.T) {
	tmp := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	if err := os.WriteFile("radas.yml", []byte("name: demo\n"), 0o644); err != nil {
		t.Fatalf("write radas.yml: %v", err)
	}
	if err := os.MkdirAll("envs", 0o755); err != nil {
		t.Fatalf("mkdir envs: %v", err)
	}
	if err := os.WriteFile("envs/.env.production", []byte("A=1\n"), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" {
			t.Errorf("unexpected probe %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	t.Setenv("RADAS_API_URL", srv.URL)

	out := runEnvCmd(t, "check", "production")
	for _, want := range []string{"radas.yml", "envs/.env.production", "ONLINE"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected real diagnostic %q in output:\n%s", want, out)
		}
	}
	for _, fake := range []string{"12ms latency", "AWS / ByteDC", "v2.rotated", "0 leaks", "NONE DETECTED", "HEALTHY (100% Operational)"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated diagnostic %q printed:\n%s", fake, out)
		}
	}
}

func TestEnvCheckReportsUnreachableServerHonestly(t *testing.T) {
	tmp := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })
	if err := os.WriteFile("radas.yml", []byte("name: demo\n"), 0o644); err != nil {
		t.Fatalf("write radas.yml: %v", err)
	}
	t.Setenv("RADAS_API_URL", "http://127.0.0.1:1")

	out := runEnvCmd(t, "check", "production")
	if !strings.Contains(out, "unreachable") {
		t.Errorf("expected an honest unreachability report, got:\n%s", out)
	}
	if strings.Contains(out, "HEALTHY (100% Operational)") {
		t.Errorf("fabricated healthy verdict printed:\n%s", out)
	}
}

func TestEnvListReflectsLocalEnvsDirectory(t *testing.T) {
	tmp := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	out := runEnvCmd(t, "list")
	if !strings.Contains(out, "No envs/ directory") {
		t.Errorf("expected an honest empty report without envs/, got:\n%s", out)
	}

	if err := os.MkdirAll("envs", 0o755); err != nil {
		t.Fatalf("mkdir envs: %v", err)
	}
	_ = os.WriteFile("envs/.env.staging", []byte("B=2\n"), 0o644)
	_ = os.WriteFile("envs/.env.example", []byte("C=3\n"), 0o644)

	out = runEnvCmd(t, "list")
	if !strings.Contains(out, "staging") {
		t.Errorf("expected the real env file name in the listing:\n%s", out)
	}
	for _, fake := range []string{"production", "preview-pr-42", "HEALTHY (Synced)", "aws / bytedc"} {
		if strings.Contains(out, fake) && fake != "production" {
			t.Errorf("fabricated environment row %q printed:\n%s", fake, out)
		}
	}
	if strings.Contains(out, "example") {
		t.Errorf("example template must not be listed as an environment:\n%s", out)
	}
}
