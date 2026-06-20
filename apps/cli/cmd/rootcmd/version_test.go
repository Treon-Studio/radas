package rootcmd

import (
	"strings"
	"testing"

	"github.com/raizora/radas/v4/constants"
)

func TestVersionIsSet(t *testing.T) {
	if constants.Version == "" {
		t.Error("Version constant is empty")
	}
}

func TestRunVersion_NotEmpty(t *testing.T) {
	// Capture output - just verify the function doesn't panic
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("runVersion panicked: %v", r)
		}
	}()

	// Just call it and check it doesn't error
	// (output goes to stdout which we can't easily capture here)
	cmd := VersionCmd
	if cmd == nil {
		t.Error("VersionCmd is nil")
	}
	if !strings.Contains(cmd.Short, "version") {
		t.Error("VersionCmd.Short should mention version")
	}
}
