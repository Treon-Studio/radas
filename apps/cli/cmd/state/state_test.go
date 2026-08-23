package state

import (
	"bytes"
	"testing"
)

func TestStateCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Pull
	Cmd.SetArgs([]string{"pull", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("state pull failed: %v", err)
	}

	// 2. Unlock
	Cmd.SetArgs([]string{"unlock", "prod-vpc", "-l", "lock_12345"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("state unlock failed: %v", err)
	}

	// 3. Graph
	Cmd.SetArgs([]string{"graph", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("state graph failed: %v", err)
	}
}
