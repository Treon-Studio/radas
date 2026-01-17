package infra

import (
	"github.com/spf13/cobra"
)

// DockerCmd is the docker subcommand for infrastructure
var DockerCmd = &cobra.Command{
	Use:   "docker",
	Short: "Docker utilities and cleanup tools",
	Long:  `Commands for managing Docker resources including cleanup of images, containers, volumes, and networks.`,
}

func init() {
	// Register docker subcommands
	DockerCmd.AddCommand(DockerCleanCmd)
}
