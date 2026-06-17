package infra

import (
	"github.com/spf13/cobra"
)

// Cmd is the root command for Infrastructure utilities
var Cmd = &cobra.Command{
	Use:   "infra",
	Short: "Infrastructure utilities (Docker, Kubernetes, etc.)",
	Long:  `Commands for managing infrastructure resources including Docker, Kubernetes, and cloud services.`,
}

func init() {
	// Register all infra subcommands
	Cmd.AddCommand(DockerCmd)
	Cmd.AddCommand(InfraIgnoreCmd)
}
