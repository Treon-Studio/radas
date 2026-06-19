package workspace

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunnerIntegration(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "radas.yml"),
		[]byte(`name: runner-int
workspace:
  projects: [apps/*]
  task_types: { backend-api: be }
  tasks:
    noop:
      command: "true"
      cache: true
`), 0644)
	apps := filepath.Join(root, "apps", "api")
	os.MkdirAll(apps, 0755)
	os.WriteFile(filepath.Join(apps, "radas.yml"),
		[]byte("name: api\ntype: backend-api\n"), 0644)

	oldDir, _ := os.Getwd()
	os.Chdir(root)
	defer os.Chdir(oldDir)

	t.Setenv("HOME", t.TempDir())

	// First run: cache miss
	var buf bytes.Buffer
	runCmd.SetOut(&buf)
	runCmd.SetErr(&buf)
	runCmd.SetArgs([]string{"noop", "--project=api"})
	if err := runCmd.ParseFlags([]string{"--project=api"}); err != nil {
		t.Fatal(err)
	}
	if err := runRun(runCmd, []string{"noop"}); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	t.Logf("first run output:\n%s", out)
	if !strings.Contains(out, "api") {
		t.Errorf("output missing api")
	}

	// Second run: should be a cache hit
	buf.Reset()
	runCmd.SetOut(&buf)
	runCmd.SetErr(&buf)
	runCmd.SetArgs([]string{"noop", "--project=api"})
	if err := runCmd.ParseFlags([]string{"--project=api"}); err != nil {
		t.Fatal(err)
	}
	if err := runRun(runCmd, []string{"noop"}); err != nil {
		t.Fatal(err)
	}
	t.Logf("second run output:\n%s", buf.String())
	if !strings.Contains(buf.String(), "hit") {
		t.Errorf("expected cache hit on second run")
	}

	// Cache status should show 1 entry
	buf.Reset()
	cacheStatusCmd.SetOut(&buf)
	if err := runCacheStatus(cacheStatusCmd); err != nil {
		t.Fatal(err)
	}
	t.Logf("cache status:\n%s", buf.String())
	if !strings.Contains(buf.String(), "1") && !strings.Contains(buf.String(), "Entries") {
		t.Errorf("cache status unexpected")
	}

	// Cache clear
	buf.Reset()
	cacheClearCmd.SetOut(&buf)
	if err := runCacheClear(cacheClearCmd); err != nil {
		t.Fatal(err)
	}
	t.Logf("cache clear:\n%s", buf.String())
	if !strings.Contains(buf.String(), "Cleared") {
		t.Errorf("cache clear unexpected")
	}
}
