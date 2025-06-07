package backend

import (
	"github.com/spf13/cobra"
	"radas/internal/checker"
)

// DoctorCmd is the command to check Backend tools
var DoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check Backend tools installation",
	Long:  `Check if Go, Elixir, and other backend tools are installed and ready to use.`,
	Run: func(cmd *cobra.Command, args []string) {
		runBackendDoctor()
	},
}

func runBackendDoctor() {
	// Check all backend tools
	checker.CheckGolang()
	checker.CheckElixir()
	checker.CheckRust()
	checker.CheckMaven()
}