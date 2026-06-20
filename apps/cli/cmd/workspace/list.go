package workspace

import "github.com/spf13/cobra"

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all projects in the workspace",
	RunE: func(cmd *cobra.Command, args []string) error { return runList(cmd) },
}
