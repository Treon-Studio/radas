// Package stack implements the `radas stack` command group for cloud and infrastructure orchestration.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package stack

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

// Cmd is the parent command for the stack orchestration group.
var Cmd = &cobra.Command{
	Use:     "stack",
	Aliases: []string{"stacks"},
	Short:   "Manage and orchestrate OpenTofu and Ansible infrastructure stacks",
	Long: `The stack command group provides CLI operations for infrastructure stacks:
listing managed stacks, queueing speculative plans and applies, and
inspecting stack state, drift, and run timelines.`,
}

type StackInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Provider    string `json:"provider"`
	Environment string `json:"environment"`
	Status      string `json:"status"`
	LastRun     string `json:"last_run,omitempty"`
}

// RunResult mirrors the 202 response of POST /api/cloud/stacks/<name>/actions:
// plan and apply are queued server-side and executed by a worker, so the CLI
// reports the queued run instead of fabricating plan/apply output.
type RunResult struct {
	OK        bool   `json:"ok"`
	RunID     string `json:"run_id"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	ProjectID string `json:"project_id"`
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
	Aliases: []string{"ls"},
	Short:   "List all managed infrastructure stacks",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("📡 Fetching infrastructure stacks from RADAS API...")
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Stacks []StackInfo `json:"stacks"`
		}
		_, err := callAPI(ctx, cmd, http.MethodGet, "/api/cloud/stacks", nil, &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("stack list: %w", err)
		}

		if len(resp.Stacks) == 0 {
			fmt.Println("No stacks found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "STACK ID\tNAME\tPROVIDER\tENVIRONMENT\tSTATUS")
		for _, s := range resp.Stacks {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", s.ID, s.Name, s.Provider, s.Environment, s.Status)
		}
		w.Flush()
		return nil
	},
}

var planCmd = &cobra.Command{
	Use:   "plan <stack-id>",
	Short: "Queue a speculative OpenTofu plan run for a stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		fmt.Printf("Queueing speculative plan for stack '%s'...\n", stackID)
		var res RunResult
		payload := map[string]string{"action": "plan"}
		_, err := callAPI(ctx, cmd, http.MethodPost, fmt.Sprintf("/api/cloud/stacks/%s/actions", stackID), payload, &res)
		if err != nil {
			return fmt.Errorf("stack plan: %w", err)
		}

		fmt.Printf("Run %s queued (status: %s). The server executes the plan when a worker claims it.\n", res.RunID, res.Status)
		return nil
	},
}

var applyCmd = &cobra.Command{
	Use:   "apply <stack-id>",
	Short: "Queue an apply run for a stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		fmt.Printf("Queueing apply for stack '%s'...\n", stackID)
		var res RunResult
		payload := map[string]string{"action": "apply"}
		_, err := callAPI(ctx, cmd, http.MethodPost, fmt.Sprintf("/api/cloud/stacks/%s/actions", stackID), payload, &res)
		if err != nil {
			return fmt.Errorf("stack apply: %w", err)
		}

		fmt.Printf("Run %s queued (status: %s). The server executes the apply when a worker claims it.\n", res.RunID, res.Status)
		return nil
	},
}

var statusCmd = &cobra.Command{
	Use:   "status <stack-id>",
	Short: "Inspect stack state, health, and drift detection status",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var res struct {
			Name     string         `json:"name"`
			Provider string         `json:"provider"`
			Meta     map[string]any `json:"meta"`
			Drift    struct {
				Enabled bool   `json:"enabled"`
				Status  string `json:"status"`
				RunID   string `json:"last_run_id"`
			} `json:"drift"`
			Locked bool `json:"locked"`
			// lock_reason is the server's plain-string lock description
			// ("" when unlocked); the structured lock object only lives in
			// meta["locked"], never in this top-level field.
			LockReason string `json:"lock_reason"`
		}
		_, err := callAPI(ctx, cmd, http.MethodGet, fmt.Sprintf("/api/cloud/stacks/%s", stackID), nil, &res)
		if err != nil {
			return fmt.Errorf("stack status: %w", err)
		}

		fmt.Printf("Stack Details: %s\n", res.Name)
		fmt.Printf("Provider: %s\n", res.Provider)
		fmt.Printf("Locked: %v\n", res.Locked)
		if res.Locked && res.LockReason != "" {
			fmt.Printf("Lock Reason: %s\n", res.LockReason)
		}
		if res.Drift.Enabled {
			fmt.Printf("Drift Status: %s\n", res.Drift.Status)
		} else {
			fmt.Println("Drift Status: detection disabled")
		}
		if v, ok := res.Meta["last_status"].(string); ok && v != "" {
			fmt.Printf("Last Run Status: %s\n", v)
		}
		return nil
	},
}

func init() {
	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(planCmd)
	Cmd.AddCommand(applyCmd)
	Cmd.AddCommand(statusCmd)
}
