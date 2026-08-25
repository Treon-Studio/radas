package stack

import (
	"bytes"
	"testing"
)

func TestStackCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Test List
	Cmd.SetArgs([]string{"list"})
	err := Cmd.Execute()
	if err != nil {
		t.Fatalf("stack list failed: %v", err)
	}

	// 2. Test Plan
	Cmd.SetArgs([]string{"plan", "prod-vpc"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("stack plan failed: %v", err)
	}

	// 3. Test Apply
	Cmd.SetArgs([]string{"apply", "prod-vpc"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("stack apply failed: %v", err)
	}

	// 4. Test Status
	Cmd.SetArgs([]string{"status", "prod-vpc"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("stack status failed: %v", err)
	}
}
