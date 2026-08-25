package worker

import (
	"bytes"
	"testing"
)

func TestWorkerCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("worker list failed: %v", err)
	}

	// 2. Drain
	Cmd.SetArgs([]string{"drain", "worker-node-01"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("worker drain failed: %v", err)
	}

	// 3. Status
	Cmd.SetArgs([]string{"status"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("worker status failed: %v", err)
	}
}
