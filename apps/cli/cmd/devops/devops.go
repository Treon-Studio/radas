package devops

import (
	"github.com/spf13/cobra"
)

// Cmd runs the DevOps tool checks directly; "radas devops doctor" remains
// available as the explicit form.
var Cmd = &cobra.Command{
	Use:   "devops",
	Short: "Check DevOps tool installation (Docker, kubectl, Terraform, ...)",
	Long: `Check whether the DevOps toolchain is installed: Docker, Kubernetes
CLI, Terraform, Ansible, and Helm.

Runs the same checks as "radas devops doctor"; the grouped form is kept
for discoverability.`,
	Example: `  # Check the DevOps toolchain
  radas devops`,
	RunE: func(cmd *cobra.Command, args []string) error {
		runDevopsDoctor()
		return nil
	},
}

func init() {
	// Register all devops subcommands
	Cmd.AddCommand(DoctorCmd)
}
