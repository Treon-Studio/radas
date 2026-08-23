package secret

import (
	"bytes"
	"testing"
)

func TestSecretCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Scan
	Cmd.SetArgs([]string{"scan", "."})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("secret scan failed: %v", err)
	}

	// 2. Rotate
	Cmd.SetArgs([]string{"rotate", "kms-key-prod-01"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("secret rotate failed: %v", err)
	}

	// 3. Encrypt
	Cmd.SetArgs([]string{"encrypt", "terraform.tfvars"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("secret encrypt failed: %v", err)
	}

	// 4. Decrypt
	Cmd.SetArgs([]string{"decrypt", "terraform.tfvars.enc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("secret decrypt failed: %v", err)
	}
}
