package graph

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/raizora/radas/v4/internal/project"
)

func TestAffectedFilesToProjects(t *testing.T) {
	projects := []project.Project{
		{Name: "api", Path: "apps/api"},
		{Name: "shared", Path: "libs/shared"},
		{Name: "web", Path: "apps/web"},
	}
	files := []string{"apps/api/main.go", "libs/shared/types.go", "docs/readme.md"}
	affected := mapFilesToProjects(files, projects)
	if len(affected) != 2 {
		t.Errorf("got %d affected, want 2 (api, shared): %v", len(affected), affected)
	}
	apiHit, sharedHit := false, false
	for _, a := range affected {
		if a == "api" {
			apiHit = true
		}
		if a == "shared" {
			sharedHit = true
		}
	}
	if apiHit == false || sharedHit == false {
		t.Errorf("missing api or shared in %v", affected)
	}
}

func TestGitDiff(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()
	for _, c := range [][]string{
		{"init", "-q"},
		{"config", "user.email", "t@t"},
		{"config", "user.name", "T"},
		{"commit", "--allow-empty", "-m", "init"},
	} {
		cmd := exec.Command("git", c...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", c, err, out)
		}
	}
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("x"), 0644)
	exec.Command("git", "-C", dir, "add", "a.txt").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "add").Run()

	files, err := gitDiffFiles(dir, "HEAD~1", "HEAD")
	if err != nil {
		t.Fatalf("gitDiffFiles: %v", err)
	}
	if len(files) != 1 || files[0] != "a.txt" {
		t.Errorf("got %v, want [a.txt]", files)
	}
}

func TestAffectedEndToEnd(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()
	// Init git repo
	for _, c := range [][]string{
		{"init", "-q"},
		{"config", "user.email", "t@t"},
		{"config", "user.name", "T"},
		{"commit", "--allow-empty", "-m", "init"},
	} {
		cmd := exec.Command("git", c...)
		cmd.Dir = dir
		_ = cmd.Run()
	}
	// Add a file in apps/api, commit
	os.MkdirAll(filepath.Join(dir, "apps", "api"), 0755)
	os.WriteFile(filepath.Join(dir, "apps", "api", "main.go"), []byte("package main"), 0644)
	exec.Command("git", "-C", dir, "add", ".").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "add api").Run()

	projects := []project.Project{
		{Name: "api", Path: "apps/api", Dependencies: []string{"shared"}},
		{Name: "shared", Path: "libs/shared"},
		{Name: "web", Path: "apps/web", Dependencies: []string{"shared"}},
	}
	g, _ := Build(projects)
	aff, err := g.Affected(dir, "HEAD~1", "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	// api changed; web depends on shared (which api depends on, so web is NOT a descendant of api)
	// shared is a dependency of api, so shared is a descendant? No, dependencies are upstream, not descendants.
	// Only api itself should be affected
	if len(aff) != 1 || aff[0] != "api" {
		t.Errorf("got %v, want [api]", aff)
	}
}
