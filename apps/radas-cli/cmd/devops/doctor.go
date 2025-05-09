package devops

import (
	"github.com/spf13/cobra"
	"radas/internal/checker"
)

// DoctorCmd is the command to check DevOps tools
var DoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check DevOps tools installation",
	Long:  `Check if Docker, Kubernetes CLI, Terraform, and other DevOps tools are installed.`,
	Run: func(cmd *cobra.Command, args []string) {
		runDevopsDoctor()
	},
}

func runDevopsDoctor() {
	// Check all devops tools
	checker.CheckDocker()
	checker.CheckKubectl()
	checker.CheckTerraform()
	checker.CheckAnsible()
	checker.CheckHelm()
}