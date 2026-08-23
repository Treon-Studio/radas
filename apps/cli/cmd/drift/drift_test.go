package drift

import (
	"bytes"
	"testing"
)

func TestDriftCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Scan
	Cmd.SetArgs([]string{"scan", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("drift scan failed: %v", err)
	}

	// 2. Remediate
	Cmd.SetArgs([]string{"remediate", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("drift remediate failed: %v", err)
	}

	// 3. Schedule
	Cmd.SetArgs([]string{"schedule", "0 */4 * * *"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("drift schedule failed: %v", err)
	}
}
