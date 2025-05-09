package frontend

import (
	"github.com/spf13/cobra"
	"radas/internal/checker"
)

// InstallCmd is the command to install Frontend dependencies
var InstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Frontend dependencies",
	Long:  `Run the appropriate package installation command based on the detected lock file (npm/pnpm/yarn).`,
	Run: func(cmd *cobra.Command, args []string) {
		checker.InstallFrontendDependencies()
	},
}