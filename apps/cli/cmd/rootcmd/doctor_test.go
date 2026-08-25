package rootcmd

import (
	"bytes"
	"testing"
)

func TestDoctorCommand(t *testing.T) {
	buf := new(bytes.Buffer)
	DoctorCmd.SetOut(buf)

	err := DoctorCmd.Execute()
	if err != nil {
		t.Fatalf("doctor command failed: %v", err)
	}
}
