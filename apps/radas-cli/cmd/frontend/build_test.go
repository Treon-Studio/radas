package frontend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectBuildCommand(t *testing.T) {
	tempDir := t.TempDir()
	cases := []struct {
		file    string
		wantCmd string
		wantArg string
	}{
		{"pnpm-lock.yaml", "pnpm", "build"},
		{"yarn.lock", "yarn", "build"},
		{"bun.lockb", "bun", "run build"},
		{"package-lock.json", "npm", "run build"},
	}
	for _, tc := range cases {
		t.Run(tc.file, func(t *testing.T) {
			f := filepath.Join(tempDir, tc.file)
			os.WriteFile(f, []byte("dummy"), 0644)
			cmd, arg := detectBuildCommand(tempDir)
			if cmd != tc.wantCmd || arg != tc.wantArg {
				t.Errorf("detectBuildCommand(%s) = (%s, %s), want (%s, %s)", tc.file, cmd, arg, tc.wantCmd, tc.wantArg)
			}
			os.Remove(f)
		})
	}
	// No lock file
	cmd, arg := detectBuildCommand(tempDir)
	if cmd != "" || arg != "" {
		t.Errorf("detectBuildCommand(no lock) = (%s, %s), want ('', '')", cmd, arg)
	}
}

func TestBuildCmd(t *testing.T) {
	c := buildCmd("echo", "hello", ".")
	if c.Path != "echo" {
		t.Errorf("buildCmd path = %s, want echo", c.Path)
	}
	if c.Dir != "." {
		t.Errorf("buildCmd dir = %s, want .", c.Dir)
	}
}
