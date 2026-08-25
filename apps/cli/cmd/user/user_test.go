package user

import (
	"bytes"
	"testing"
)

func TestUserCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("user list failed: %v", err)
	}

	// 2. Invite
	Cmd.SetArgs([]string{"invite", "newuser@corp.io", "-r", "developer"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("user invite failed: %v", err)
	}

	// 3. Deactivate
	Cmd.SetArgs([]string{"deactivate", "usr-002"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("user deactivate failed: %v", err)
	}

	// 4. Revoke
	Cmd.SetArgs([]string{"revoke-sessions", "usr-002"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("user revoke-sessions failed: %v", err)
	}
}
