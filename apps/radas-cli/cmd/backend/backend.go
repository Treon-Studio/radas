package backend

import (
	"github.com/spf13/cobra"
)

// Cmd is the root command for Backend team
var Cmd = &cobra.Command{
	Use:   "be",
	Short: "Commands for Backend team",
	Long:  `Commands to facilitate Backend team daily activities.`,
}

func init() {
	// Register all backend subcommands
	Cmd.AddCommand(DoctorCmd)
	Cmd.AddCommand(InitCmd)
	Cmd.AddCommand(InstallCmd)
	Cmd.AddCommand(CleanCmd)
	Cmd.AddCommand(FreshCmd)
}