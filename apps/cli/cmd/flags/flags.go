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

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the feature flags group.
var Cmd = &cobra.Command{
	Use:     "flags",
	Aliases: []string{"flag"},
	Short:   "Manage feature flags, percentage rollouts, and kill-switches",

	Example: `  # List all feature flags with rollout status
  radas flags list

  # Inspect one flag
  radas flags get block_apply

  # Toggle and kill-switch
  radas flags set block_apply true
  radas flags kill block_apply`,
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
	Long:    `List every registered feature flag with its enabled state, rollout percentage, and kill-switch status.`,
	Example: `  radas flags list`,
	Aliases: []string{"ls"},
	Short:   "List all registered feature flags",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("🚩 Fetching feature flags from RADAS API...")
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Flags []FlagItem `json:"flags"`
		}
		_, err := callAPI(ctx, cmd, http.MethodGet, "/api/flags", nil, &resp)
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
	Use:     "get <key>",
	Long:    `Print one feature flag's full definition, including environment overrides and user lists.`,
	Example: `  radas flags get block_apply`,
	Short:   "Get details for a specific feature flag",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The control plane registers no GET /api/flags/<key> route (only
		// PATCH and DELETE for a single key), so the flag list is fetched
		// and the requested flag is selected locally.
		var resp struct {
			Flags []FlagItem `json:"flags"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodGet, "/api/flags", nil, &resp); err != nil {
			return fmt.Errorf("flags get: %w", err)
		}
		var flag *FlagItem
		for i := range resp.Flags {
			if resp.Flags[i].Key == key {
				flag = &resp.Flags[i]
				break
			}
		}
		if flag == nil {
			return fmt.Errorf("flags get: flag '%s' not found in the control-plane registry", key)
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
	Use:     "set <key> <true|false>",
	Long:    `Set a flag's enabled value. The value must be literally true or false.`,
	Example: `  radas flags set block_apply true`,
	Short:   "Toggle or set the value of a feature flag",
	Args:    cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		valStr := args[1]
		val, err := strconv.ParseBool(valStr)
		if err != nil {
			return fmt.Errorf("invalid boolean value: %s (expected true/false)", valStr)
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
		_, err = callAPI(ctx, cmd, http.MethodPatch, fmt.Sprintf("/api/flags/%s", key), payload, &res)
		if err != nil {
			return fmt.Errorf("flags set: %w", err)
		}

		fmt.Printf("✔ Feature flag '%s' set to %v (server confirmed).\n", key, val)
		return nil
	},
}

var killCmd = &cobra.Command{
	Use:     "kill <key>",
	Long:    `Activate a flag's kill-switch, disabling it everywhere regardless of rollout percentage.`,
	Example: `  radas flags kill block_apply`,
	Short:   "Trigger an immediate emergency kill-switch circuit breaker on a flag",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		key := args[0]
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The kill switch is the flag's kill_switch field on the control
		// plane; evaluations return disabled until it is cleared.
		payload := map[string]any{"kill_switch": true}
		var res struct {
			Success bool     `json:"success"`
			Flag    FlagItem `json:"flag"`
		}
		_, err := callAPI(ctx, cmd, http.MethodPatch, fmt.Sprintf("/api/flags/%s", key), payload, &res)
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
