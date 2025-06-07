package devops

import (
	"github.com/spf13/cobra"
)

// Cmd is the root command for DevOps team
var Cmd = &cobra.Command{
	Use:   "devops",
	Short: "Commands for DevOps team",
	Long:  `Commands to facilitate DevOps team daily activities.`,
}

func init() {
	// Register all devops subcommands
	Cmd.AddCommand(DoctorCmd)
}