package runner

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/raizora/radas/v4/internal/cache"
	"github.com/raizora/radas/v4/internal/project"
)

func TestExecuteTaskSimple(t *testing.T) {
	cacheDir := t.TempDir()
	c := cache.NewLocalCache(cacheDir)
	node := TaskNode{
		Project: project.Project{Name: "test", Path: "."},
		Task:    "noop",
		Command: "true",
	}
	res, err := ExecuteTask(node, c, ExecOptions{MaxParallel: 1})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExitCode != 0 {
		t.Errorf("exit=%d", res.ExitCode)
	}
	if res.CacheHit {
		t.Error("first run should not be a cache hit")
	}
}

func TestExecuteTaskCacheHit(t *testing.T) {
	cacheDir := t.TempDir()
	c := cache.NewLocalCache(cacheDir)
	tmp := t.TempDir()
	// Create a project dir with a known file
	projDir := filepath.Join(tmp, "proj")
	os.MkdirAll(projDir, 0755)
	os.WriteFile(filepath.Join(projDir, "main.go"), []byte("package main"), 0644)
	node := TaskNode{
		Project: project.Project{Name: "test", Path: projDir},
		Task:    "cached",
		Command: "echo hello",
	}
	// First run: cache miss
	res1, _ := ExecuteTask(node, c, ExecOptions{MaxParallel: 1})
	if res1.CacheHit {
		t.Fatal("first run should be miss")
	}
	// Second run: should be cache hit
	res2, _ := ExecuteTask(node, c, ExecOptions{MaxParallel: 1})
	if !res2.CacheHit {
		t.Error("second run should be hit")
	}
}

func TestRunBatchParallel(t *testing.T) {
	cacheDir := t.TempDir()
	c := cache.NewLocalCache(cacheDir)
	tmp := t.TempDir()
	var tasks []TaskNode
	for i, name := range []string{"a", "b", "c"} {
		dir := filepath.Join(tmp, name)
		os.MkdirAll(dir, 0755)
		os.WriteFile(filepath.Join(dir, "f.txt"), []byte(name), 0644)
		tasks = append(tasks, TaskNode{
			Project: project.Project{Name: name, Path: dir},
			Task:    "noop",
			Command: "true",
		})
		_ = i
	}
	results := RunBatch(tasks, c, ExecOptions{MaxParallel: 3}, nil)
	if len(results) != 3 {
		t.Errorf("got %d results, want 3", len(results))
	}
	for _, r := range results {
		if r.ExitCode != 0 {
			t.Errorf("task %s exit=%d", r.Node.Project.Name, r.ExitCode)
		}
	}
}
