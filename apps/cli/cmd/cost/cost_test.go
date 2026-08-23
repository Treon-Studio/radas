package cost

import (
	"bytes"
	"testing"
)

func TestCostCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. Estimate
	Cmd.SetArgs([]string{"estimate", "prod-vpc"})
	err := Cmd.Execute()
	if err != nil {
		t.Fatalf("cost estimate failed: %v", err)
	}

	// 2. Anomalies
	Cmd.SetArgs([]string{"anomalies"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("cost anomalies failed: %v", err)
	}
}
