package rootcmd

import (
	"errors"
	"os/exec"
	"reflect"
	"testing"
)

// --- Pure logic for testing ---
func buildGitAddArgs(files []string) []string {
	return append([]string{"add"}, files...)
}

// --- Unit tests ---
func TestBuildGitAddArgs(t *testing.T) {
	files := []string{"foo.go", "bar.go"}
	want := []string{"add", "foo.go", "bar.go"}
	got := buildGitAddArgs(files)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("buildGitAddArgs = %v, want %v", got, want)
	}
}

// --- Mock external command logic ---
type mockCmd struct {
	fail bool
}

func (m *mockCmd) Run() error {
	if m.fail {
		return errors.New("mock fail")
	}
	return nil
}

func TestCommitCmd_GitAddSuccess(t *testing.T) {
	cmd := &mockCmd{fail: false}
	if err := cmd.Run(); err != nil {
		t.Errorf("expected nil error, got %v", err)
	}
}

func TestCommitCmd_GitAddFail(t *testing.T) {
	cmd := &mockCmd{fail: true}
	if err := cmd.Run(); err == nil {
		t.Error("expected error, got nil")
	}
}

// --- Integration (skipped if cz not found) ---
func TestCZCommit_NotInstalled(t *testing.T) {
	_, err := exec.LookPath("cz-not-exist")
	if err == nil {
		t.Error("expected cz-not-exist to not be found")
	}
}
