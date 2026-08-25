package approval

import (
	"bytes"
	"testing"
)

func TestApprovalCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("approval list failed: %v", err)
	}

	// 2. Approve
	Cmd.SetArgs([]string{"approve", "appr-9821a", "-m", "LGTM"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("approval approve failed: %v", err)
	}

	// 3. Reject with reason
	rejectCmd.Flags().Set("reason", "Security review incomplete")
	Cmd.SetArgs([]string{"reject", "appr-9821a", "--reason", "Security review incomplete"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("approval reject failed: %v", err)
	}

	// 4. Reject without reason fails when flag is empty
	rejectCmd.Flags().Set("reason", "")
	Cmd.SetArgs([]string{"reject", "appr-9821a"})
	if err := Cmd.Execute(); err == nil {
		t.Fatalf("expected failure when reason is omitted")
	}

	// 5. History
	Cmd.SetArgs([]string{"history"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("approval history failed: %v", err)
	}
}
