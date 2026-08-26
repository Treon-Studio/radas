package frontend

import (
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/checker"
	"github.com/raizora/radas/v4/internal/netgate"
)

// InstallCmd is the command to install Frontend dependencies
var InstallCmd = &cobra.Command{
	Use:     "install",
	Short:   "Install Frontend dependencies",
	Long:    `Run the appropriate package installation command based on the detected lock file (npm/pnpm/yarn).`,
	PreRunE: netgate.RequireNetwork("Frontend Package Install"),
	Run: func(cmd *cobra.Command, args []string) {
		checker.InstallFrontendDependencies()
	},
}