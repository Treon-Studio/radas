// Package flags implements the `radas flags` command group for feature flag management.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package flags

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the feature flags group.
var Cmd = &cobra.Command{
	Use:     "flags",
	Aliases: []string{"flag"},
	Short:   "Manage feature flags, percentage rollouts, and kill-switches",
	Long: `The flags command group allows querying, toggling, and triggering emergency
kill-switches for feature flags across environments and projects.`,
}

type FlagItem struct {
	Key            string `json:"key"`
	Name           string `json:"name"`
	Enabled        bool   `json:"enabled"`
	RolloutPercent int    `json:"rollout_percent"`
	KillSwitch     bool   `json:"kill_switch"`
	ScopeType      string `json:"scope_type"`
}

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

var listCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List all registered feature flags",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("🚩 Fetching feature flags from RADAS API...")
		spin.Start()

		c, err := getClient(cmd)
		if err != nil {
			spin.Stop()
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Flags []FlagItem `json:"flags"`
		}
		_, err = doAPI(ctx, c, http.MethodGet, "/api/flags", nil, &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("flags list: %w", err)
		}

		if len(resp.Flags) == 0 {
			fmt.Println("No feature flags found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "FLAG KEY\tENABLED\tROLLOUT\tKILL-SWITCH\tSCOPE")
		for _, f := range resp.Flags {
			fmt.Fprintf(w, "%s\t%v\t%d%%\t%v\t%s\n", f.Key, f.Enabled, f.RolloutPercent, f.KillSwitch, f.ScopeType)
		}
		w.Flush()
		return nil
	},
}

var getCmd = &cobra.Command{
	Use:   "get <key>",
	Short: "Get details for a specific feature flag",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var flag FlagItem
		_, err = doAPI(ctx, c, http.MethodGet, fmt.Sprintf("/api/flags/%s", key), nil, &flag)
		if err != nil {
			return fmt.Errorf("flags get: %w", err)
		}

		fmt.Printf("Flag: %s\n", flag.Key)
		fmt.Printf("Name: %s\n", flag.Name)
		fmt.Printf("Enabled: %v\n", flag.Enabled)
		fmt.Printf("Rollout: %d%%\n", flag.RolloutPercent)
		fmt.Printf("Kill Switch: %v\n", flag.KillSwitch)
		return nil
	},
}

var setCmd = &cobra.Command{
	Use:   "set <key> <true|false>",
	Short: "Toggle or set the value of a feature flag",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		valStr := args[1]
		val, err := strconv.ParseBool(valStr)
		if err != nil {
			return fmt.Errorf("invalid boolean value: %s (expected true/false)", valStr)
		}

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The control plane updates flags via PATCH /api/flags/<key>; there
		// is no dedicated /toggle route.
		payload := map[string]any{"enabled": val}
		var res struct {
			Success bool     `json:"success"`
			Flag    FlagItem `json:"flag"`
		}
		_, err = doAPI(ctx, c, http.MethodPatch, fmt.Sprintf("/api/flags/%s", key), payload, &res)
		if err != nil {
			return fmt.Errorf("flags set: %w", err)
		}

		fmt.Printf("✔ Feature flag '%s' set to %v (server confirmed).\n", key, val)
		return nil
	},
}

var killCmd = &cobra.Command{
	Use:   "kill <key>",
	Short: "Trigger an immediate emergency kill-switch circuit breaker on a flag",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The kill switch is the flag's kill_switch field on the control
		// plane; evaluations return disabled until it is cleared.
		payload := map[string]any{"kill_switch": true}
		var res struct {
			Success bool     `json:"success"`
			Flag    FlagItem `json:"flag"`
		}
		_, err = doAPI(ctx, c, http.MethodPatch, fmt.Sprintf("/api/flags/%s", key), payload, &res)
		if err != nil {
			return fmt.Errorf("flags kill: %w", err)
		}

		fmt.Printf("⚠️ Kill switch enabled for flag '%s' (server confirmed).\n", key)
		fmt.Println("Flag evaluations return disabled until the kill switch is cleared.")
		return nil
	},
}

func init() {
	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(getCmd)
	Cmd.AddCommand(setCmd)
	Cmd.AddCommand(killCmd)
}
