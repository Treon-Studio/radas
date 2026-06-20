package workspace

import "github.com/spf13/cobra"

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize workspace mode in the current directory",
	RunE: func(cmd *cobra.Command, args []string) error { return runInit(cmd) },
}
