// Package state implements the `radas state` command group for state inspection and DAG visualization.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package state

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the state management group.
var Cmd = &cobra.Command{
	Use:     "state",
	Aliases: []string{"tfstate"},
	Short:   "Inspect remote OpenTofu state, release stuck locks, and render resource graphs",

	Example: `  # Pull remote state for a stack
  radas state pull prod-net

  # Release a stuck state lock
  radas state unlock prod-net

  # Render the resource graph
  radas state graph prod-net`,
	Long: `The state command group inspects the remote PostgreSQL-backed state the
control plane manages (GET /api/cloud/stacks/<name>/state), releases stuck
locks through the real lock route (DELETE /api/cloud/stacks/<name>/state/lock),
and renders a local dependency view from the real resource list.`,
}

// stateInfo mirrors the response of GET /api/cloud/stacks/<name>/state
// (services/cloud_provisioning.stacks_state).
type stateInfo struct {
	StatePresent  *bool    `json:"state_present"`
	ResourceCount int      `json:"resource_count"`
	Resources     []string `json:"resources"`
	Message       string   `json:"message"`
	Error         string   `json:"error"`
}

func (s stateInfo) present() bool { return s.StatePresent != nil && *s.StatePresent }

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

// fetchState fetches the remote state summary for a stack through the shared
// credential resolution.
func fetchState(ctx context.Context, cmd *cobra.Command, stackID string) (*stateInfo, error) {
	var info stateInfo
	if _, err := callAPI(ctx, cmd, http.MethodGet, fmt.Sprintf("/api/cloud/stacks/%s/state", stackID), nil, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

var pullCmd = &cobra.Command{
	Use:     "pull <stack-id>",
	Long:    `Pull the remote OpenTofu state for a stack and print it.`,
	Example: `  radas state pull prod-net`,
	Short:   "Inspect the remote state summary the control plane holds for a stack",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		info, err := fetchState(ctx, cmd, stackID)
		if err != nil {
			return fmt.Errorf("state pull: %w", err)
		}

		if !info.present() {
			fmt.Printf("State for stack '%s': not present on the backend.\n", stackID)
			if info.Message != "" {
				fmt.Printf("(%s)\n", info.Message)
			}
			return nil
		}
		if info.Error != "" {
			fmt.Printf("State for stack '%s': present but unreadable: %s\n", stackID, info.Error)
			return nil
		}

		fmt.Printf("State for stack '%s': present, %d resources.\n", stackID, info.ResourceCount)
		if len(info.Resources) == 0 {
			return nil
		}
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "RESOURCE ADDRESS")
		for _, addr := range info.Resources {
			fmt.Fprintf(w, "%s\n", addr)
		}
		w.Flush()
		return nil
	},
}

var unlockCmd = &cobra.Command{
	Use:     "unlock <stack-id>",
	Long:    `Release a stuck remote-state lock held by a dead worker, by exact lease id.`,
	Example: `  radas state unlock prod-net`,
	Short:   "Release a stuck state lock through the control-plane lock route",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		lockID, _ := cmd.Flags().GetString("lock-id")
		force, _ := cmd.Flags().GetBool("force")
		reason, _ := cmd.Flags().GetString("reason")

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		// DELETE /api/cloud/stacks/<name>/state/lock releases the lock; the
		// server verifies the lock id unless force is requested.
		params := url.Values{}
		if lockID != "" && lockID != "auto" {
			params.Set("lock_id", lockID)
		}
		if force {
			params.Set("force", "true")
		}
		if reason != "" {
			params.Set("reason", reason)
		}
		path := fmt.Sprintf("/api/cloud/stacks/%s/state/lock", stackID)
		if enc := params.Encode(); enc != "" {
			path += "?" + enc
		}

		var res struct {
			OK      bool   `json:"ok"`
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodDelete, path, nil, &res); err != nil {
			return fmt.Errorf("state unlock: %w", err)
		}
		if !res.OK {
			msg := res.Error
			if msg == "" {
				msg = res.Message
			}
			return fmt.Errorf("state unlock: the server did not release the lock on '%s'%s", stackID, suffix(msg))
		}

		fmt.Printf("✔ State lock released for '%s' (server confirmed).\n", stackID)
		return nil
	},
}

var graphCmd = &cobra.Command{
	Use:     "graph <stack-id>",
	Long:    `Render the stack's resource graph from remote state.`,
	Example: `  radas state graph prod-net`,
	Short:   "Render a local resource view from the stack's real remote state",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		info, err := fetchState(ctx, cmd, stackID)
		if err != nil {
			return fmt.Errorf("state graph: %w", err)
		}

		if !info.present() {
			fmt.Printf("Dependency graph for '%s': no state on the backend, nothing to render.\n", stackID)
			return nil
		}
		if len(info.Resources) == 0 {
			fmt.Printf("Dependency graph for '%s': state present but contains no resources.\n", stackID)
			return nil
		}

		fmt.Printf("Dependency graph for '%s' (rendered locally from the remote state; the control plane does not expose resource dependencies):\n\n", stackID)
		for _, addr := range info.Resources {
			fmt.Printf("  [%s]\n", addr)
		}
		return nil
	},
}

func init() {
	unlockCmd.Flags().StringP("lock-id", "l", "auto", "Lock ID to release (omit or 'auto' to let the server verify)")
	unlockCmd.Flags().Bool("force", false, "Force the release even when the lock id does not match")
	unlockCmd.Flags().String("reason", "", "Why the lock is being released")

	Cmd.AddCommand(pullCmd)
	Cmd.AddCommand(unlockCmd)
	Cmd.AddCommand(graphCmd)
}

// suffix renders ": <msg>" for non-empty messages.
func suffix(msg string) string {
	if msg == "" {
		return ""
	}
	return ": " + msg
}
