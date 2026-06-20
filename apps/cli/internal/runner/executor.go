package runner

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/raizora/radas/v4/internal/cache"
	"github.com/raizora/radas/v4/internal/project"
)

// ExecOptions controls execution behavior.
type ExecOptions struct {
	MaxParallel  int
	ForceNoCache bool
}

// TaskResult is the outcome of executing a single task.
type TaskResult struct {
	Node      TaskNode
	ExitCode  int
	StartedAt time.Time
	Duration  time.Duration
	CacheHit  bool
	Stdout    string
	Stderr    string
	Error     error
}

// ExecuteTask runs a single task with cache check. If the cache has a
// matching entry, returns it without re-running.
func ExecuteTask(node TaskNode, c *cache.LocalCache, opts ExecOptions) (TaskResult, error) {
	res := TaskResult{Node: node, StartedAt: time.Now()}
	defer func() { res.Duration = time.Since(res.StartedAt) }()

	hash := cache.ComputeHash(cache.HashInput{
		Files:       listProjectFiles(node.Project),
		TaskCommand: node.Command,
	})

	if opts.ForceNoCache == false && c != nil {
		if entry, ok := c.Get(hash); ok {
			res.ExitCode = entry.ExitCode
			res.CacheHit = true
			ms := cache.NewManifestStore(c.Dir)
			if logs := ms.Logs(hash); logs != nil {
				res.Stdout = string(logs.Stdout)
				res.Stderr = string(logs.Stderr)
			}
			return res, nil
		}
	}

	cmd := exec.CommandContext(context.Background(), "sh", "-c", node.Command)
	if node.Project.Path != "" {
		cmd.Dir = node.Project.Path
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	res.Stdout = stdout.String()
	res.Stderr = stderr.String()

	if exitErr, ok := err.(*exec.ExitError); ok {
		res.ExitCode = exitErr.ExitCode()
	} else if err != nil {
		res.Error = err
		return res, err
	} else {
		res.ExitCode = 0
	}

	if res.Error == nil && res.ExitCode == 0 && c != nil {
		_ = c.Put(cache.Entry{
			Key:       hash,
			Project:   node.Project.Name,
			Task:      node.Task,
			ExitCode:  res.ExitCode,
			StartedAt: res.StartedAt,
			Duration:  res.Duration,
		})
		ms := cache.NewManifestStore(c.Dir)
		_ = ms.SaveLog(hash, "stdout", []byte(res.Stdout))
		_ = ms.SaveLog(hash, "stderr", []byte(res.Stderr))
		_ = ms.SaveMeta(hash, cache.Meta{Task: node.Task, Project: node.Project.Name, ExitCode: res.ExitCode})
	}

	return res, nil
}

func listProjectFiles(p project.Project) []string {
	if p.Path == "" {
		return nil
	}
	var files []string
	_ = filepath.Walk(p.Path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			base := filepath.Base(path)
			if base == ".git" || base == "node_modules" || base == "bin" || base == "dist" {
				return filepath.SkipDir
			}
			return nil
		}
		files = append(files, path)
		return nil
	})
	return files
}

