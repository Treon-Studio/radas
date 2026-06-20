package workspace

import "github.com/spf13/cobra"

var validateCmd = &cobra.Command{
	Use:   "validate",
	Short: "Check the workspace for cycles, orphans, and stale config",
	RunE: func(cmd *cobra.Command, args []string) error { return runValidate(cmd) },
}
