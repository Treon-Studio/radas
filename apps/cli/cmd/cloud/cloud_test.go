package cloud

import (
	"bytes"
	"testing"
)

func TestCloudCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Probe
	Cmd.SetArgs([]string{"probe", "aws"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("cloud probe failed: %v", err)
	}

	// 2. Inventory
	Cmd.SetArgs([]string{"inventory"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("cloud inventory failed: %v", err)
	}

	// 3. Import
	Cmd.SetArgs([]string{"import", "aws_vpc", "module.vpc.aws_vpc.main", "vpc-0a1b2c3d"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("cloud import failed: %v", err)
	}

	// 4. Diff
	Cmd.SetArgs([]string{"diff", "prod-vpc"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("cloud diff failed: %v", err)
	}
}
