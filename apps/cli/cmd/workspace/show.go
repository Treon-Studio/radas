package workspace

import "github.com/spf13/cobra"

var showCmd = &cobra.Command{
	Use:   "show <project>",
	Short: "Show details of a specific project",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error { return runShow(cmd, args) },
}
