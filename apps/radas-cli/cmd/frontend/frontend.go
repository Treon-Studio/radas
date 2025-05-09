package frontend

import (
	"github.com/spf13/cobra"
)

// Cmd is the root command for Frontend team
var Cmd = &cobra.Command{
	Use:   "fe",
	Short: "Commands for Frontend team",
	Long:  `Commands to facilitate Frontend team daily activities.`,
}

func init() {
	// Register all frontend subcommands
	Cmd.AddCommand(DoctorCmd)
	Cmd.AddCommand(InstallCmd)
	Cmd.AddCommand(CleanCmd)
	Cmd.AddCommand(DevCmd)
	Cmd.AddCommand(FreshCmd)
	Cmd.AddCommand(InitCmd)
	Cmd.AddCommand(BuildCmd)
}