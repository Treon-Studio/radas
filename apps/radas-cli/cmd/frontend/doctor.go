package frontend

import (
	"github.com/spf13/cobra"
	"radas/internal/checker"
)

// DoctorCmd is the command to check Frontend tools
var DoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check Frontend tools installation",
	Long:  `Check if NodeJS, npm, and other frontend tools are installed and ready to use.`,
	Run: func(cmd *cobra.Command, args []string) {
		runFrontendDoctor()
	},
}
func runFrontendDoctor() {
	// Check all frontend tools
	checker.CheckNodeJS()
	checker.CheckNPM()
	checker.CheckYarn()
	checker.CheckPnpm()
}