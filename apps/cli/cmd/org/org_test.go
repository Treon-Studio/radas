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
}
