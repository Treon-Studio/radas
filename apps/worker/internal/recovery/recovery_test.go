package recovery

// Failure/recovery drills for the worker-side recovery sweep (Task 6.3 of the
// 2026-08-27 console/CLI integration plan). RecoverStuck walks the projects
// tree and force-terminates executions stuck in RUNNING/CANCELING — the same
// semantics as the server's server_recover_stuck_executions, applied to the
// opaque JSON files the worker owns. The Go port never calls the backend's
// executions_store; a separate backend process terminalizes with validated
// transitions. These drills pin the worker's own cleanup contract:
//
//   - stale RUNNING past maxAgeMinutes        -> FAILED with a timeout error
//   - stale CANCELING past maxCancelMinutes   -> CANCELED with reason timeout
//   - fresh RUNNING / CANCELING               -> left untouched
//   - final statuses and malformed files      -> left untouched, no panic
//
// The sweep is driven against a temporary config.ProjectsDir, so the drill is
// offline-safe (no live server) and runs in the default `go test ./...` gate.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/opensible/worker-go/internal/config"
)

const (
	drillProject = "drill-project"
	execDirRel   = "history/executions"
)

// useTempProjectsDir points config.ProjectsDir at a fresh temp dir for the
// duration of the test and restores the previous value afterwards.
func useTempProjectsDir(t *testing.T) {
	t.Helper()
	projectsDir := filepath.Join(t.TempDir(), "projects")
	if err := os.MkdirAll(projectsDir, 0o755); err != nil {
		t.Fatalf("mkdir projects dir: %v", err)
	}
	previous := config.ProjectsDir
	config.ProjectsDir = projectsDir
	t.Cleanup(func() { config.ProjectsDir = previous })
}

func writeExecution(t *testing.T, name string, data map[string]any) string {
	t.Helper()
	dir := filepath.Join(config.ProjectsDir, drillProject, execDirRel)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir executions dir: %v", err)
	}
	path := filepath.Join(dir, name)
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal execution: %v", err)
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatalf("write execution: %v", err)
	}
	return path
}

func readExecution(t *testing.T, path string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read execution: %v", err)
	}
	var data map[string]any
	if err := json.Unmarshal(b, &data); err != nil {
		t.Fatalf("unmarshal execution: %v", err)
	}
	return data
}

func TestRecoverStuckTerminatesStaleRunningAndCanceling(t *testing.T) {
	useTempProjectsDir(t)
	now := float64(time.Now().Unix())

	staleRunning := writeExecution(t, "stale-running.json", map[string]any{
		"id": "exec-stale-running", "projectId": drillProject, "status": "RUNNING",
		"startedAt": now - 2*3600, "workerId": "drill-worker",
	})
	staleCanceling := writeExecution(t, "stale-canceling.json", map[string]any{
		"id": "exec-stale-canceling", "projectId": drillProject, "status": "CANCELING",
		"startedAt": now - 3*3600, "cancelRequestedAt": now - 3600, "workerId": "drill-worker",
	})
	freshRunning := writeExecution(t, "fresh-running.json", map[string]any{
		"id": "exec-fresh-running", "projectId": drillProject, "status": "RUNNING",
		"startedAt": now - 60, "workerId": "drill-worker",
	})
	finished := writeExecution(t, "finished.json", map[string]any{
		"id": "exec-finished", "projectId": drillProject, "status": "SUCCESS",
		"startedAt": now - 8*3600, "finishedAt": now - 7*3600,
	})
	// RUNNING without startedAt has no recoverable age and must be skipped.
	noStart := writeExecution(t, "no-start.json", map[string]any{
		"id": "exec-no-start", "projectId": drillProject, "status": "RUNNING",
		"workerId": "drill-worker",
	})
	broken := filepath.Join(filepath.Dir(staleRunning), "broken.json")
	if err := os.WriteFile(broken, []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write broken file: %v", err)
	}

	RecoverStuck(30, 5)

	stale := readExecution(t, staleRunning)
	if stale["status"] != "FAILED" {
		t.Errorf("drill=crash: stale RUNNING status = %v, want FAILED", stale["status"])
	}
	if errText, _ := stale["error"].(string); errText != "Execution timeout" {
		t.Errorf("drill=crash: stale RUNNING error = %q, want %q", errText, "Execution timeout")
	}
	if _, ok := stale["finishedAt"].(float64); !ok {
		t.Errorf("drill=crash: stale RUNNING must record finishedAt")
	}

	canceling := readExecution(t, staleCanceling)
	if canceling["status"] != "CANCELED" {
		t.Errorf("drill=crash: stale CANCELING status = %v, want CANCELED", canceling["status"])
	}
	if reason, _ := canceling["cancelReason"].(string); reason != "timeout" {
		t.Errorf("drill=crash: stale CANCELING cancelReason = %q, want %q", reason, "timeout")
	}

	fresh := readExecution(t, freshRunning)
	if fresh["status"] != "RUNNING" {
		t.Errorf("drill=crash: fresh RUNNING must stay RUNNING, got %v", fresh["status"])
	}
	done := readExecution(t, finished)
	if done["status"] != "SUCCESS" {
		t.Errorf("drill=crash: final execution must stay SUCCESS, got %v", done["status"])
	}
	unstarted := readExecution(t, noStart)
	if unstarted["status"] != "RUNNING" {
		t.Errorf("drill=crash: RUNNING without startedAt must stay RUNNING, got %v", unstarted["status"])
	}
	if b, err := os.ReadFile(broken); err != nil || string(b) != "{not-json" {
		t.Errorf("drill=crash: malformed file must be left untouched (err=%v)", err)
	}
}

func TestRecoverStuckLeavesEmptyProjectsTreeUntouched(t *testing.T) {
	useTempProjectsDir(t)
	if err := os.MkdirAll(filepath.Join(config.ProjectsDir, "empty-project", execDirRel), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	RecoverStuck(30, 5) // must not panic on the empty tree
}
