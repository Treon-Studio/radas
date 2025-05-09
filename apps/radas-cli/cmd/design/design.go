package design

import (
	"github.com/spf13/cobra"
)

// Cmd is the root command for Design team
var Cmd = &cobra.Command{
	Use:   "design",
	Short: "Commands for Design team",
	Long:  `Commands to facilitate Design team daily activities.`,
}

func init() {
	// Register all design subcommands
	Cmd.AddCommand(DoctorCmd)
}