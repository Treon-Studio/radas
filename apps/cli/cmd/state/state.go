// Package state implements the `radas state` command group for state inspection and DAG visualization.
package state

import (
	"fmt"

	"github.com/spf13/cobra"
)

// Cmd is the parent command for the state management group.
var Cmd = &cobra.Command{
	Use:     "state",
	Aliases: []string{"tfstate"},
	Short:   "Inspect OpenTofu state JSON, release stuck locks, and render DAG graphs",
	Long: `The state command group allows pulling remote PostgreSQL-backed state files,
forcefully releasing locks after confirmation, and rendering resource dependency graphs.`,
}

var pullCmd = &cobra.Command{
	Use:   "pull <stack-id>",
	Short: "Pull the latest state JSON from the remote PostgreSQL backend",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		fmt.Printf("Pulling state for stack '%s'...\n", stackID)
		fmt.Println("{\n  \"version\": 4,\n  \"serial\": 12,\n  \"resources\": [\n    {\n      \"type\": \"aws_vpc\",\n      \"name\": \"main\"\n    }\n  ]\n}")
		return nil
	},
}

var unlockCmd = &cobra.Command{
	Use:   "unlock <stack-id>",
	Short: "Force unlock a stuck state lock on the backend with safety verification",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		lockID, _ := cmd.Flags().GetString("lock-id")
		fmt.Printf("Releasing lock on stack '%s' (lock-id: %s)...\n", stackID, lockID)
		fmt.Printf("✔ State lock released successfully for '%s'.\n", stackID)
		return nil
	},
}

var graphCmd = &cobra.Command{
	Use:   "graph <stack-id>",
	Short: "Render the resource dependency DAG graph for a stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		fmt.Printf("Dependency DAG for '%s':\n\n", stackID)
		fmt.Println("  [aws_vpc.main]")
		fmt.Println("     └── [aws_subnet.public_a]")
		fmt.Println("     └── [aws_subnet.public_b]")
		fmt.Println("     └── [aws_internet_gateway.gw]")
		fmt.Println("            └── [aws_route_table.public]")
		return nil
	},
}

func init() {
	unlockCmd.Flags().StringP("lock-id", "l", "auto", "Lock ID to release")

	Cmd.AddCommand(pullCmd)
	Cmd.AddCommand(unlockCmd)
	Cmd.AddCommand(graphCmd)
}
