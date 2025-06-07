package frontend

import (
	"testing"
	"github.com/spf13/cobra"
)

func TestCmdDefinition(t *testing.T) {
	if Cmd.Use != "fe" {
		t.Errorf("Cmd.Use = %q, want 'fe'", Cmd.Use)
	}
	if Cmd.Short == "" {
		t.Error("Cmd.Short should not be empty")
	}
	if Cmd.Long == "" {
		t.Error("Cmd.Long should not be empty")
	}
}

func TestCmdHasSubcommands(t *testing.T) {
	subs := Cmd.Commands()
	if len(subs) == 0 {
		t.Error("Frontend Cmd should have subcommands registered")
	}
}

func TestCmdHelpOutput(t *testing.T) {
	cmd := &cobra.Command{Use: "test"}
	Cmd.SetOut(nil)
	Cmd.SetErr(nil)
	Cmd.SetArgs([]string{"--help"})
	err := Cmd.Execute()
	if err != nil && err != cobra.ErrSubCommandRequired {
		t.Errorf("Help command failed: %v", err)
	}
}
