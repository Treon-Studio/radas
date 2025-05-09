package rootcmd

import (
	"os/exec"
	"strings"
	"testing"
)

func getBranchName(cmdOutput string, err error) (string, error) {
	if err != nil {
		return "", err
	}
	branch := strings.TrimSpace(cmdOutput)
	if branch == "" {
		return "", err
	}
	return branch, nil
}

func TestGetBranchName(t *testing.T) {
	tests := []struct{
		name string
		output string
		err error
		want string
		wantErr bool
	}{
		{"normal", "main\n", nil, "main", false},
		{"empty", "", nil, "", true},
		{"error", "", exec.ErrNotFound, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := getBranchName(tt.output, tt.err)
			if (err != nil) != tt.wantErr {
				t.Errorf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("got = %q, want %q", got, tt.want)
			}
		})
	}
}


func TestPushCmdArgs(t *testing.T) {
	branch := "main"
	args := []string{"push", "origin", branch, "--dry-run"}
	pushCmd := exec.Command("git", args...)
	got := pushCmd.Args[1:]
	if len(got) != len(args) {
		t.Errorf("args len = %d, want %d", len(got), len(args))
	}
	for i := range got {
		if got[i] != args[i] {
			t.Errorf("arg[%d] = %q, want %q", i, got[i], args[i])
		}
	}
}

func TestPushCmd_Error(t *testing.T) {
	branch := "main"
	cmd := exec.Command("not-a-real-git", "push", "origin", branch)
	err := cmd.Run()
	if err == nil {
		t.Error("expected error for non-existent command")
	}
}

