// Package org implements the `radas org` command group for multi-tenant organization management.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// Switching the active organization is a local selector change: the server
// remains the authorization authority and validates access on every request.
package org

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the organization group.
var Cmd = &cobra.Command{
	Use:     "org",
	Aliases: []string{"orgs", "organization"},
	Short:   "Manage multi-tenant organizations and switch active context",
	Long: `The org command group enables listing organizational memberships from the
control plane and switching the active org context. The switch is a local
CLI selector change; the server validates organization access per request.`,
}

type OrgInfo struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	IsCurrent bool   `json:"is_current"`
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
	Short:   "List organizations accessible to the current user",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("🏢 Fetching accessible organizations from RADAS API...")
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Orgs []OrgInfo `json:"orgs"`
		}
		_, err := callAPI(ctx, cmd, http.MethodGet, "/api/orgs", nil, &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("org list: %w", err)
		}

		if len(resp.Orgs) == 0 {
			fmt.Println("No organizations found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "ORG ID\tSLUG\tNAME\tYOUR ROLE\tACTIVE")
		for _, o := range resp.Orgs {
			activeStr := ""
			if o.IsCurrent {
				activeStr = "✔ CURRENT"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", o.ID, o.Slug, o.Name, o.Role, activeStr)
		}
		w.Flush()
		return nil
	},
}

var switchCmd = &cobra.Command{
	Use:   "switch <org-id-or-slug>",
	Short: "Switch the active organization selector used by subsequent commands",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orgTarget := args[0]

		// Local selector persistence only: identifiers are stored, never
		// tokens, and the server validates membership on every request.
		if err := config.SaveSelector(config.Selector{OrganizationID: orgTarget}); err != nil {
			return fmt.Errorf("save organization selector: %w", err)
		}

		fmt.Printf("✔ Active organization selector set to '%s' (local selector; the server validates access on every request).\n", orgTarget)
		return nil
	},
}

var rulesCmd = &cobra.Command{
	Use:     "rules [org-id]",
	Aliases: []string{"standards", "policies"},
	Short:   "View organization-wide standard best-practice guardrails and rules",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("org rules are not available: the control plane does not expose an organization rules API yet (no GET /api/orgs/<org_id>/rules route), so no rules can be shown")
	},
}

var setRulesCmd = &cobra.Command{
	Use:   "set-rules [org-id]",
	Short: "Configure standard best practice rules and enforcement mode for an organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("org set-rules is not available: the control plane does not expose an organization rules API yet (no POST /api/orgs/<org_id>/rules route), so no rules were changed")
	},
}

func init() {
	setRulesCmd.Flags().String("require-tags", "environment,owner,CostCenter", "Comma-separated list of mandatory tags")
	setRulesCmd.Flags().String("deny-ports", "22,3389", "Comma-separated list of prohibited public ingress ports")
	setRulesCmd.Flags().Bool("enforce", true, "Strictly block deployments violating standard rules")

	rulesCmd.AddCommand(setRulesCmd)

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(switchCmd)
	Cmd.AddCommand(rulesCmd)
}
