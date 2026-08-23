package testcmd

import (
	"bytes"
	"testing"
)

func TestTestCmdCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test list failed: %v", err)
	}

	// 2. Show
	Cmd.SetArgs([]string{"show", "tc-001"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test show failed: %v", err)
	}

	// 3. Run
	Cmd.SetArgs([]string{"run", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test run failed: %v", err)
	}

	// 4. Idempotency
	Cmd.SetArgs([]string{"idempotency", "playbooks/site.yml"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test idempotency failed: %v", err)
	}

	// 5. Score
	Cmd.SetArgs([]string{"score", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test score failed: %v", err)
	}
}
