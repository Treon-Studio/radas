package flags

import (
	"bytes"
	"testing"
)

func TestFlagsCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	err := Cmd.Execute()
	if err != nil {
		t.Fatalf("flags list failed: %v", err)
	}

	// 2. Get
	Cmd.SetArgs([]string{"get", "dark-mode-v2"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("flags get failed: %v", err)
	}

	// 3. Set
	Cmd.SetArgs([]string{"set", "dark-mode-v2", "true"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("flags set failed: %v", err)
	}

	// 4. Kill
	Cmd.SetArgs([]string{"kill", "dark-mode-v2"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("flags kill failed: %v", err)
	}
}
