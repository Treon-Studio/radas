// Package drift implements the `radas drift` command group for drift detection and automated remediation.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package drift

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the drift detection group.
var Cmd = &cobra.Command{
	Use:     "drift",
	Aliases: []string{"drifts"},
	Short:   "Detect and remediate out-of-band infrastructure state drift",
	Long: `The drift command group queues control-plane drift checks for managed stacks
(POST /api/cloud/stacks/<stack>/drift-check), inspects drift results, manages
the per-stack audit schedule, and reconciles by queueing an apply run.`,
}

// callAPI performs one authenticated control-plane call through the shared
// credential resolution (auth.DoWithRefresh): the --token flag / RADAS_TOKEN
// environment wins for CI, stored `radas auth login` credentials are
// presented otherwise and auto-refreshed once on a 401, and with neither
// source the server's 401 surfaces as the typed auth.ErrNotAuthenticated.
func callAPI(ctx context.Context, cmd *cobra.Command, method, path string, body, result any) (*client.Response, error) {
	return auth.DoWithRefresh(ctx, cmd, func(c *client.Client) (*client.Response, error) {
		return doAPI(ctx, c, method, path, body, result)
	})
}

// doAPI performs one control-plane call with an explicit correlation ID so
// failures are reported with the request ID for server-side log lookup.
// Mutating methods reuse the ID as the idempotency key.
func doAPI(ctx context.Context, c *client.Client, method, path string, body, result any) (*client.Response, error) {
	rid := client.NewRequestID()
	opts := client.RequestOptions{RequestID: rid}
	if method != http.MethodGet {
		opts.IdempotencyKey = rid
	}
	resp, err := c.Do(ctx, method, path, body, opts)
	if err != nil {
		return nil, fmt.Errorf("%s %s failed (request %s): %w", method, path, rid, err)
	}
	if err := resp.JSON(result); err != nil {
		return nil, fmt.Errorf("%s %s: decode response (request %s): %w", method, path, rid, err)
	}
	return resp, nil
}

var scanCmd = &cobra.Command{
	Use:   "scan <stack-id>",
	Short: "Queue a read-only drift check for a stack on the control plane",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		// POST /api/cloud/stacks/<stack>/drift-check queues a read-only
		// drift execution (202); there is no all-stacks scan route.
		var res struct {
			Status string `json:"status"`
			Stack  string `json:"stack"`
			RunID  string `json:"run_id"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodPost, fmt.Sprintf("/api/cloud/stacks/%s/drift-check", stackID), nil, &res); err != nil {
			return fmt.Errorf("drift scan: %w", err)
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "STACK\tSTATUS\tRUN ID")
		fmt.Fprintf(w, "%s\t%s\t%s\n", res.Stack, res.Status, res.RunID)
		w.Flush()
		fmt.Println("Drift check queued server-side; inspect the result with 'radas stack status' or 'radas cloud diff'.")
		return nil
	},
}

var remediateCmd = &cobra.Command{
	Use:   "remediate <stack-id>",
	Short: "Reconcile drift by queueing an apply run for the stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// The control plane reconciles drift by queueing a normal apply run
		// (POST /api/cloud/stacks/<name>/actions {"action":"apply"}); there
		// is no dedicated remediation endpoint.
		payload := map[string]string{"action": "apply"}
		var res struct {
			OK     bool   `json:"ok"`
			RunID  string `json:"run_id"`
			Status string `json:"status"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodPost, fmt.Sprintf("/api/cloud/stacks/%s/actions", stackID), payload, &res); err != nil {
			return fmt.Errorf("drift remediate: %w", err)
		}

		fmt.Printf("✔ Reconciliation apply queued for '%s' (run %s, status %s).\n", stackID, res.RunID, res.Status)
		return nil
	},
}

var scheduleCmd = &cobra.Command{
	Use:   "schedule <stack-id> [cron-expression]",
	Short: "Show or set the recurring background drift audit schedule for a stack",
	Args:  cobra.RangeArgs(1, 2),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		if len(args) == 1 {
			// GET /api/cloud/stacks/<stack>/drift-schedule shows the current config.
			var sched struct {
				Enabled      bool   `json:"enabled"`
				Cron         string `json:"cron"`
				AlertOnDrift bool   `json:"alert_on_drift"`
			}
			if _, err := callAPI(ctx, cmd, http.MethodGet, fmt.Sprintf("/api/cloud/stacks/%s/drift-schedule", stackID), nil, &sched); err != nil {
				return fmt.Errorf("drift schedule: %w", err)
			}
			fmt.Printf("Drift schedule for '%s': enabled=%v cron=%s alert_on_drift=%v\n", stackID, sched.Enabled, sched.Cron, sched.AlertOnDrift)
			return nil
		}

		// PUT /api/cloud/stacks/<stack>/drift-schedule sets and validates it.
		cronExpr := args[1]
		payload := map[string]any{"enabled": true, "cron": cronExpr}
		var res struct {
			Success  bool `json:"success"`
			Schedule struct {
				Enabled      bool   `json:"enabled"`
				Cron         string `json:"cron"`
				AlertOnDrift bool   `json:"alert_on_drift"`
			} `json:"schedule"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodPut, fmt.Sprintf("/api/cloud/stacks/%s/drift-schedule", stackID), payload, &res); err != nil {
			return fmt.Errorf("drift schedule: %w", err)
		}

		fmt.Printf("✔ Drift schedule for '%s' set (enabled=%v cron=%s) — server confirmed.\n", stackID, res.Schedule.Enabled, res.Schedule.Cron)
		return nil
	},
}

func init() {
	Cmd.AddCommand(scanCmd)
	Cmd.AddCommand(remediateCmd)
	Cmd.AddCommand(scheduleCmd)
}
