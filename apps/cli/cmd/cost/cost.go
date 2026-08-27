// Package cost implements the `radas cost` command group for FinOps and cloud cost management.
//
// The control plane currently serves payload-based cost estimation
// (POST /api/cost/estimate with provider + resources) and aggregation
// endpoints (/api/cost/monthly|forecast|breakdown|rollup|rightsizing); there
// is no per-stack estimate route and no cost-alerts route, so those commands
// fail explicitly instead of fabricating numbers.
package cost

import (
	"fmt"

	"github.com/spf13/cobra"
)

// Cmd is the parent command for the FinOps cost management group.
var Cmd = &cobra.Command{
	Use:     "cost",
	Aliases: []string{"finops"},
	Short:   "Estimate infrastructure cloud spend and detect cost anomalies",
	Long: `The cost command group surfaces FinOps data served by the RADAS control plane.
Per-stack estimation is planned once the CLI can collect a stack's resource
payload; this CLI does not fabricate cost numbers.`,
}

var estimateCmd = &cobra.Command{
	Use:   "estimate <stack-id>",
	Short: "Calculate the projected monthly cloud cost delta for a stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		return fmt.Errorf("cost estimate is not available for stack '%s': the control plane only serves POST /api/cost/estimate with an explicit provider + resources payload (there is no per-stack estimate route), and the CLI cannot collect a stack's resource payload yet; no numbers were fabricated", stackID)
	},
}

var anomaliesCmd = &cobra.Command{
	Use:     "anomalies",
	Aliases: []string{"alerts"},
	Short:   "List active cloud spending alerts and anomalous resource spikes",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("cost anomalies is not available: the control plane has no cost-alert or anomalies route, so nothing was listed")
	},
}

func init() {
	Cmd.AddCommand(estimateCmd)
	Cmd.AddCommand(anomaliesCmd)
}
