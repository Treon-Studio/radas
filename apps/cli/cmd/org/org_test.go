package org

import (
	"bytes"
	"testing"
)

func TestOrgCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org list failed: %v", err)
	}

	// 2. Switch
	Cmd.SetArgs([]string{"switch", "org-sandbox"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org switch failed: %v", err)
	}

	// 3. Rules
	Cmd.SetArgs([]string{"rules", "org-global"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org rules failed: %v", err)
	}

	// 4. Set Rules
	Cmd.SetArgs([]string{"rules", "set-rules", "org-global", "--require-tags", "env,team", "--deny-ports", "22", "--enforce"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org set-rules failed: %v", err)
	}
}
