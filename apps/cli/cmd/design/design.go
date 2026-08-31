package design

import (
	"github.com/spf13/cobra"
)

// Cmd runs the design tool checks directly; "radas design doctor" remains
// available as the explicit form.
var Cmd = &cobra.Command{
	Use:   "design",
	Short: "Check design tool installation (Figma, Sketch, ...)",
	Long: `Check whether the design toolchain is installed: Figma, Sketch,
Adobe XD, and Inkscape.

Runs the same checks as "radas design doctor"; the grouped form is kept
for discoverability.`,
	Example: `  # Check the design toolchain
  radas design`,
	RunE: func(cmd *cobra.Command, args []string) error {
		runDesignDoctor()
		return nil
	},
}

func init() {
	// Register all design subcommands
	Cmd.AddCommand(DoctorCmd)
}
