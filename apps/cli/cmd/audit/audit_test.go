package audit

import (
	"bytes"
	"testing"
)

func TestAuditCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list", "-a", "stack.apply"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("audit list failed: %v", err)
	}

	// 2. Export
	Cmd.SetArgs([]string{"export", "--format", "csv"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("audit export failed: %v", err)
	}

	// 3. Evidence
	Cmd.SetArgs([]string{"evidence"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("audit evidence failed: %v", err)
	}
}
