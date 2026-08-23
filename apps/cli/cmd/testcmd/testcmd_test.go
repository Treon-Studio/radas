package testcmd

import (
	"bytes"
	"testing"
)

func TestTestCmdCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Run
	Cmd.SetArgs([]string{"run", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test run failed: %v", err)
	}

	// 2. Idempotency
	Cmd.SetArgs([]string{"idempotency", "playbooks/site.yml"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test idempotency failed: %v", err)
	}

	// 3. Score
	Cmd.SetArgs([]string{"score", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("test score failed: %v", err)
	}
}
