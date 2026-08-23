package registry

import (
	"bytes"
	"testing"
)

func TestRegistryCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	err := Cmd.Execute()
	if err != nil {
		t.Fatalf("registry list failed: %v", err)
	}

	// 2. Install
	Cmd.SetArgs([]string{"install", "tofu-block/vpc-ha"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("registry install failed: %v", err)
	}

	// 3. Publish
	Cmd.SetArgs([]string{"publish", "."})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("registry publish failed: %v", err)
	}
}
