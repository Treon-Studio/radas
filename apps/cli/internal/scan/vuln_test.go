package scan

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunGovulncheck_SkippedNoGoMod(t *testing.T) {
	dir := t.TempDir()
	r := RunGovulncheck(dir)
	if !r.Pass {
		t.Errorf("expected Pass=true when no go.mod, got Pass=%v Summary=%q", r.Pass, r.Summary)
	}
	if r.Summary != "skipped (no go.mod)" {
		t.Errorf("expected 'skipped (no go.mod)', got %q", r.Summary)
	}
}

func TestRunGovulncheck_HasGoMod(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module test\ngo 1.25\n"), 0644)
	// Just verify it doesn't panic and returns something
	r := RunGovulncheck(dir)
	if r.Tool != "govulncheck" {
		t.Errorf("expected Tool=govulncheck, got %q", r.Tool)
	}
	// Summary will vary depending on whether govulncheck is installed
	if r.Summary == "" {
		t.Error("expected non-empty Summary")
	}
}

func TestRunPnpmAudit_SkippedNoPackageJSON(t *testing.T) {
	dir := t.TempDir()
	r := RunPnpmAudit(dir)
	if !r.Pass {
		t.Errorf("expected Pass=true when no package.json, got Pass=%v", r.Pass)
	}
}

func TestRunNpmAudit_SkippedNoPackageJSON(t *testing.T) {
	dir := t.TempDir()
	r := RunNpmAudit(dir)
	if !r.Pass {
		t.Errorf("expected Pass=true when no package.json, got Pass=%v", r.Pass)
	}
}
