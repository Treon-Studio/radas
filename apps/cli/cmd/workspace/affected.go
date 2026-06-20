package workspace

import "github.com/spf13/cobra"

var affectedCmd = &cobra.Command{
	Use:   "affected",
	Short: "List projects affected by changes between git refs",
	RunE:  func(cmd *cobra.Command, args []string) error { return runAffected(cmd) },
}

func init() {
	affectedCmd.Flags().String("base", "main", "base ref")
	affectedCmd.Flags().Bool("json", false, "output as JSON")
}
