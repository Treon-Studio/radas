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

	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the state management group.
var Cmd = &cobra.Command{
	Use:     "state",
	Aliases: []string{"tfstate"},
	Short:   "Inspect remote OpenTofu state, release stuck locks, and render resource graphs",
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

// getClient resolves the shared runtime configuration (flags, environment,
// persisted selector) and builds the common API client.
func getClient(cmd *cobra.Command) (*client.Client, error) {
	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return nil, err
	}
	return rc.NewClient(), nil
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

// fetchState fetches the remote state summary for a stack.
func fetchState(ctx context.Context, c *client.Client, stackID string) (*stateInfo, error) {
	var info stateInfo
	if _, err := doAPI(ctx, c, http.MethodGet, fmt.Sprintf("/api/cloud/stacks/%s/state", stackID), nil, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

var pullCmd = &cobra.Command{
	Use:   "pull <stack-id>",
	Short: "Inspect the remote state summary the control plane holds for a stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		info, err := fetchState(ctx, c, stackID)
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
	Use:   "unlock <stack-id>",
	Short: "Release a stuck state lock through the control-plane lock route",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		lockID, _ := cmd.Flags().GetString("lock-id")
		force, _ := cmd.Flags().GetBool("force")
		reason, _ := cmd.Flags().GetString("reason")

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
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
		if _, err := doAPI(ctx, c, http.MethodDelete, path, nil, &res); err != nil {
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
	Use:   "graph <stack-id>",
	Short: "Render a local resource view from the stack's real remote state",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		info, err := fetchState(ctx, c, stackID)
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
