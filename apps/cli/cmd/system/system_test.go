package system

import (
	"bytes"
	"testing"
)

func TestSystemCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Clean
	Cmd.SetArgs([]string{"clean", "--dry-run"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system clean failed: %v", err)
	}

	// 2. Purge
	Cmd.SetArgs([]string{"purge", "--dry-run"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system purge failed: %v", err)
	}

	// 3. Analyze
	Cmd.SetArgs([]string{"analyze", ".", "-m", "100"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system analyze failed: %v", err)
	}

	// 4. Status
	Cmd.SetArgs([]string{"status"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system status failed: %v", err)
	}

	// 5. Optimize
	Cmd.SetArgs([]string{"optimize"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system optimize failed: %v", err)
	}

	// 6. Uninstall
	Cmd.SetArgs([]string{"uninstall", "NonExistentApp123", "--dry-run"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system uninstall failed: %v", err)
	}

	// 7. DS-Store
	Cmd.SetArgs([]string{"ds-store", ".", "--dry-run"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("system ds-store failed: %v", err)
	}
}
