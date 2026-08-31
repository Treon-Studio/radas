// Package cost implements the `radas cost` command group for FinOps and cloud cost management.
//
// Read commands (monthly, forecast, breakdown, rollup) query the control-plane
// cost aggregation endpoints using the standard project context (--project-id
// flag / RADAS_PROJECT_ID / persisted selector, resolved by
// config.LoadRuntimeConfig). Per-stack estimation and anomaly detection remain
// explicit stubs — they need payload collection or a cost-alert route that
// doesn't exist yet. This CLI never fabricates cost numbers.
package cost

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the FinOps cost management group.
var Cmd = &cobra.Command{
	Use:     "cost",
	Aliases: []string{"finops"},
	Short:   "Query FinOps data: cost trends, forecasts, breakdowns, rollups",
	Long: `Query the cost aggregation data served by the RADAS control plane.

All project-scoped commands resolve the project from the standard context:
--project-id flag, RADAS_PROJECT_ID environment, or the persisted selector
set by "radas project use". Estimate and anomaly commands are stubs until
the control plane serves those routes; this CLI never fabricates numbers.`,

	Example: `  # Monthly cost buckets for the selected project
  radas cost monthly --project-id proj-123

  # 3-month linear cost forecast
  radas cost forecast --project-id proj-123

  # Break costs down by provider (or tag/stack/env)
  radas cost breakdown --project-id proj-123 --by provider

  # Total cost across every project (org-wide, no project needed)
  radas cost rollup`,
}

func projectScoped(cmd *cobra.Command) (string, error) {
	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return "", err
	}
	if rc.ProjectID == "" {
		return "", fmt.Errorf("project-id is required for this command: set it with --project-id, the RADAS_PROJECT_ID environment variable, or \"radas project use <id>\"")
	}
	return rc.ProjectID, nil
}

func callAPI(ctx context.Context, cmd *cobra.Command, path string, result any) (*client.Response, error) {
	return auth.DoWithRefresh(ctx, cmd, func(c *client.Client) (*client.Response, error) {
		rid := client.NewRequestID()
		resp, err := c.Do(ctx, http.MethodGet, path, nil, client.RequestOptions{RequestID: rid})
		if err != nil {
			return nil, fmt.Errorf("GET %s failed (request %s): %w", path, rid, err)
		}
		if err := resp.JSON(result); err != nil {
			return nil, fmt.Errorf("GET %s: decode response (request %s): %w", path, rid, err)
		}
		return resp, nil
	})
}

var estimateCmd = &cobra.Command{
	Use:   "estimate <stack-id>",
	Short: "Calculate the projected monthly cloud cost delta for a stack",
	Long: `Estimate the monthly cloud cost delta for a stack.

NOT YET AVAILABLE: the control plane only serves POST /api/cost/estimate
with an explicit provider + resources payload, and the CLI cannot yet
collect a stack's resource payload. No numbers are fabricated.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		return fmt.Errorf("cost estimate is not yet available for stack '%s': the control plane only serves POST /api/cost/estimate with an explicit provider + resources payload and the CLI cannot collect a stack's resource payload yet; no numbers were fabricated", stackID)
	},
}

var anomaliesCmd = &cobra.Command{
	Use:     "anomalies",
	Aliases: []string{"alerts"},
	Short:   "List active cloud spending alerts and anomalous resource spikes",
	Long: `List cloud spending alerts and anomalous resource spikes.

NOT YET AVAILABLE: the control plane has no cost-alert or anomalies route.
Nothing is listed and no alerts are fabricated.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("cost anomalies is not yet available: the control plane has no cost-alert or anomalies route, so nothing was listed")
	},
}

var monthlyCmd = &cobra.Command{
	Use:   "monthly",
	Short: "Show the monthly cost trend for a project",
	Long: `Show per-month cost totals for a project, bucketed from saved cost
estimates by their creation month. Prints a MONTH / COST table; empty
output means no cost data has been recorded yet.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		pid, err := projectScoped(cmd)
		if err != nil {
			return err
		}
		spin := utils.NewSpinner("Fetching monthly cost data")
		spin.Start()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		var resp struct {
			Monthly []struct {
				Month string  `json:"month"`
				Total float64 `json:"total"`
			} `json:"monthly"`
		}
		_, err = callAPI(ctx, cmd, fmt.Sprintf("/api/cost/monthly?project_id=%s", pid), &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("cost monthly: %w", err)
		}
		if len(resp.Monthly) == 0 {
			fmt.Println("No cost data recorded for this project yet.")
			return nil
		}
		fmt.Printf("%-10s  %12s\n", "MONTH", "COST")
		for _, m := range resp.Monthly {
			fmt.Printf("%-10s  %12.2f\n", m.Month, m.Total)
		}
		return nil
	},
}

var forecastCmd = &cobra.Command{
	Use:   "forecast",
	Short: "Predict the cost trend for a project (3-month linear forecast)",
	Long: `Predict the next three months of cost for a project using a
least-squares linear regression over the monthly series. Reports the
method used ("linear" with 2+ data points, "flat" with fewer), the base
level, the per-month trend, and the predicted values.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		pid, err := projectScoped(cmd)
		if err != nil {
			return err
		}
		spin := utils.NewSpinner("Computing cost forecast")
		spin.Start()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		var resp struct {
			Method    string    `json:"method"`
			Base      float64   `json:"base"`
			Trend     float64   `json:"trend"`
			Predicted []float64 `json:"predicted"`
		}
		_, err = callAPI(ctx, cmd, fmt.Sprintf("/api/cost/forecast?project_id=%s", pid), &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("cost forecast: %w", err)
		}
		fmt.Printf("Method: %s\n", resp.Method)
		fmt.Printf("Base:   %.2f\n", resp.Base)
		fmt.Printf("Trend:  %.2f/month\n", resp.Trend)
		if len(resp.Predicted) > 0 {
			fmt.Println("\nPredicted months:")
			for i, p := range resp.Predicted {
				fmt.Printf("  +%d: %.2f\n", i+1, p)
			}
		}
		return nil
	},
}

var breakdownByFlag string

var breakdownCmd = &cobra.Command{
	Use:   "breakdown",
	Short: "Break down project costs by provider, tag, stack, or environment",
	Long: `Group a project's saved cost estimates by a dimension and print them
sorted descending. The --by flag accepts the server-side dimensions
(provider is the default); an unknown dimension returns an empty
breakdown rather than an error.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		pid, err := projectScoped(cmd)
		if err != nil {
			return err
		}
		spin := utils.NewSpinner("Breaking down costs")
		spin.Start()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		var resp struct {
			Breakdown []struct {
				Key   string  `json:"key"`
				Total float64 `json:"total"`
			} `json:"breakdown"`
		}
		_, err = callAPI(ctx, cmd, fmt.Sprintf("/api/cost/breakdown?project_id=%s&by=%s", pid, breakdownByFlag), &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("cost breakdown: %w", err)
		}
		if len(resp.Breakdown) == 0 {
			fmt.Println("No cost data to break down for this project yet.")
			return nil
		}
		fmt.Printf("Breakdown by %s:\n", breakdownByFlag)
		fmt.Printf("%-30s  %12s\n", "KEY", "AMOUNT")
		for _, b := range resp.Breakdown {
			fmt.Printf("%-30s  %12.2f\n", b.Key, b.Total)
		}
		return nil
	},
}

var rollupCmd = &cobra.Command{
	Use:   "rollup",
	Short: "Show the total cost across all projects",
	Long: `Sum saved cost estimates across every project the CLI's project
directory knows about and print a grand total plus a per-project table.
This command is org-wide — it does not use the project context.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("Computing multi-project rollup")
		spin.Start()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		var resp struct {
			GrandTotal float64 `json:"grand_total"`
			Projects   []struct {
				ProjectID string  `json:"project_id"`
				Total     float64 `json:"total"`
			} `json:"projects"`
		}
		_, err := callAPI(ctx, cmd, "/api/cost/rollup", &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("cost rollup: %w", err)
		}
		fmt.Printf("Grand total: %.2f\n", resp.GrandTotal)
		if len(resp.Projects) > 0 {
			fmt.Printf("\n%-30s  %12s\n", "PROJECT", "TOTAL")
			for _, p := range resp.Projects {
				fmt.Printf("%-30s  %12.2f\n", p.ProjectID, p.Total)
			}
		}
		return nil
	},
}

func init() {
	Cmd.AddCommand(estimateCmd)
	Cmd.AddCommand(anomaliesCmd)
	Cmd.AddCommand(monthlyCmd)
	Cmd.AddCommand(forecastCmd)
	breakdownCmd.Flags().StringVar(&breakdownByFlag, "by", "provider", "dimension to group by (provider, tag, stack, env)")
	Cmd.AddCommand(breakdownCmd)
	Cmd.AddCommand(rollupCmd)
}
