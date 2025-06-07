package design

import (
	"github.com/spf13/cobra"
	"radas/internal/checker"
)

// DoctorCmd is the command to check Design tools
var DoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check Design tools installation",
	Long:  `Check if Figma, Sketch, and other design tools are installed.`,
	Run: func(cmd *cobra.Command, args []string) {
		runDesignDoctor()
	},
}

func runDesignDoctor() {
	// Check all design tools
	checker.CheckFigma()
	checker.CheckSketch()
	checker.CheckAdobeXD()
	checker.CheckInkscape()
}