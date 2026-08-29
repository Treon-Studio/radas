// Package worker implements the `radas worker` command group for runner pool management.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package worker

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the worker daemon group.
var Cmd = &cobra.Command{
	Use:     "worker",
	Aliases: []string{"daemon", "runners"},
	Short:   "Inspect worker daemon pool, queue statuses, and drain nodes",

	Example: `  # List registered worker daemons
  radas worker list

  # Show the pending execution queue
  radas worker status`,
	Long: `The worker command group allows monitoring registered worker daemons and
the execution queue served by the RADAS control plane.`,
}

// WorkerNode mirrors the fields of the server's GET /api/admin/workers
// response that the CLI renders.
type WorkerNode struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Description        string `json:"description,omitempty"`
	Enabled            bool   `json:"enabled"`
	LastSeenAt         any    `json:"lastSeenAt,omitempty"`
	CurrentExecutionID string `json:"currentExecutionId,omitempty"`
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

var listCmd = &cobra.Command{
	Use:     "list",
	Long:    `List worker daemons registered in the execution pool, with heartbeat and current-execution information.`,
	Example: `  radas worker list`,
	Aliases: []string{"ls"},
	Short:   "List registered worker daemons in the execution pool",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("⚙️ Querying worker daemons & execution pool...")
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Workers []WorkerNode `json:"workers"`
		}
		// The control plane serves the worker registry under /api/admin/workers.
		_, err := callAPI(ctx, cmd, http.MethodGet, "/api/admin/workers", nil, &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("worker list: %w", err)
		}

		if len(resp.Workers) == 0 {
			fmt.Println("No workers registered.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "WORKER ID\tNAME\tENABLED\tLAST SEEN\tCURRENT RUN")
		for _, n := range resp.Workers {
			current := n.CurrentExecutionID
			if current == "" {
				current = "-"
			}
			fmt.Fprintf(w, "%s\t%s\t%v\t%v\t%s\n", n.ID, n.Name, n.Enabled, n.LastSeenAt, current)
		}
		w.Flush()
		return nil
	},
}

var drainCmd = &cobra.Command{
	Use: "drain <node-id>",
	Long: `Mark a worker as draining.

NOT YET AVAILABLE: the control plane has no drain route yet.`,
	Example: `  radas worker drain worker-7`,
	Short:   "Mark a worker as draining so it completes running jobs without accepting new claims",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		nodeID := args[0]
		return fmt.Errorf("worker drain for '%s' is not available: the control plane does not expose a drain route yet (worker registration and enable/disable live under /api/admin/workers), so the node state was not changed", nodeID)
	},
}

var statusCmd = &cobra.Command{
	Use:     "status",
	Long:    `Show the pending execution queue served by the control plane.`,
	Example: `  radas worker status`,
	Short:   "Show the pending execution queue served by the control plane",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Queued []struct {
				ID      string `json:"id"`
				RunName string `json:"runName"`
			} `json:"queued"`
			Count int `json:"count"`
		}
		_, err := callAPI(ctx, cmd, http.MethodGet, "/api/queue", nil, &resp)
		if err != nil {
			return fmt.Errorf("worker status: %w", err)
		}

		fmt.Printf("Pending (QUEUED) runs: %d\n", resp.Count)
		for _, run := range resp.Queued {
			if run.RunName != "" {
				fmt.Printf("  %s  %s\n", run.ID, run.RunName)
			} else {
				fmt.Printf("  %s\n", run.ID)
			}
		}
		return nil
	},
}

func init() {
	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(drainCmd)
	Cmd.AddCommand(statusCmd)
}
