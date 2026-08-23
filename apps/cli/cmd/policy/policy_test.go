package policy

import (
	"bytes"
	"testing"
)

func TestPolicyCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Check
	Cmd.SetArgs([]string{"check", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("policy check failed: %v", err)
	}

	// 2. Violations
	Cmd.SetArgs([]string{"violations"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("policy violations failed: %v", err)
	}

	// 3. Exempt with reason
	exemptCmd.Flags().Set("reason", "Maintenance window exception")
	Cmd.SetArgs([]string{"exempt", "POL-ENC-01", "bytedc-db", "-r", "Maintenance window exception", "-t", "48"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("policy exempt failed: %v", err)
	}

	// 4. Exempt without reason fails when flag is empty
	exemptCmd.Flags().Set("reason", "")
	Cmd.SetArgs([]string{"exempt", "POL-ENC-01", "bytedc-db"})
	if err := Cmd.Execute(); err == nil {
		t.Fatalf("expected failure when reason is omitted")
	}
}
