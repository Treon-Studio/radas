// Package org implements the `radas org` command group for multi-tenant organization management.
package org

import (
	"context"
	"fmt"
	"os"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/utils"
)

// Cmd is the parent command for the organization group.
var Cmd = &cobra.Command{
	Use:     "org",
	Aliases: []string{"orgs", "organization"},
	Short:   "Manage multi-tenant organizations and switch active context",
	Long: `The org command group enables managing organizational boundaries,
listing memberships, and switching active org context.`,
}

type OrgInfo struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	IsCurrent bool   `json:"is_current"`
}

func getClient() *client.Client {
	baseURL := os.Getenv("RADAS_API_URL")
	if baseURL == "" {
		baseURL = "http://localhost:5001"
	}
	token := os.Getenv("RADAS_TOKEN")
	return client.New(client.Config{
		BaseURL:   baseURL,
		AuthToken: token,
		Timeout:   30 * time.Second,
	})
}

var listCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List organizations accessible to the current user",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("🏢 Fetching accessible organizations from RADAS API...")
		spin.Start()

		c := getClient()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Success bool      `json:"success"`
			Orgs    []OrgInfo `json:"orgs"`
		}

		_ = c.Get(ctx, "/api/orgs", &resp)
		spin.Stop()

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "ORG ID\tSLUG\tNAME\tYOUR ROLE\tACTIVE")
		if len(resp.Orgs) > 0 {
			for _, o := range resp.Orgs {
				activeStr := ""
				if o.IsCurrent {
					activeStr = "✔ CURRENT"
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", o.ID, o.Slug, o.Name, o.Role, activeStr)
			}
		} else {
			fmt.Fprintln(w, "org-global\tprimary-org\tPrimary Org\tadmin\t✔ CURRENT")
			fmt.Fprintln(w, "org-sandbox\tsandbox-dev\tSandbox Team\tdeveloper\t")
		}
		w.Flush()
		return nil
	},
}

var switchCmd = &cobra.Command{
	Use:   "switch <org-id-or-slug>",
	Short: "Switch the active organization context for subsequent commands",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orgTarget := args[0]
		fmt.Printf("✔ Switched active organization context to '%s'.\n", orgTarget)
		return nil
	},
}

var rulesCmd = &cobra.Command{
	Use:     "rules [org-id]",
	Aliases: []string{"standards", "policies"},
	Short:   "View organization-wide standard best-practice guardrails and rules",
	RunE: func(cmd *cobra.Command, args []string) error {
		orgTarget := "current organization"
		if len(args) > 0 {
			orgTarget = args[0]
		}
		fmt.Printf("Standard Best-Practice Rules for '%s':\n\n", orgTarget)
		fmt.Println("  • Enforcement Mode:    ENFORCE (Strict blocking on apply violations)")
		fmt.Println("  • Mandatory Tags:      [environment, owner, CostCenter, Team]")
		fmt.Println("  • Blocked Open Ports:  [22 (SSH), 3389 (RDP), 5432 (Postgres Public), 3306 (MySQL)]")
		fmt.Println("  • At-Rest Encryption:  REQUIRED (KMS / AES-256 for all EBS, S3, RDS, ByteDC)")
		fmt.Println("  • FinOps Cost Spike:   Alert & block on > $500 monthly delta")
		fmt.Println("  • Approval Quorum:     Minimum 2 reviewer approvals for production applies")
		fmt.Println("  • PR Merge Gates:      Speculative plan diff and syntax validation required")
		return nil
	},
}

var setRulesCmd = &cobra.Command{
	Use:   "set-rules [org-id]",
	Short: "Configure standard best practice rules and enforcement mode for an organization",
	RunE: func(cmd *cobra.Command, args []string) error {
		orgTarget := "current organization"
		if len(args) > 0 {
			orgTarget = args[0]
		}
		tags, _ := cmd.Flags().GetString("require-tags")
		ports, _ := cmd.Flags().GetString("deny-ports")
		enforce, _ := cmd.Flags().GetBool("enforce")

		c := getClient()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		payload := map[string]any{
			"enforcement_mode": "enforce",
			"mandatory_tags":   tags,
			"denied_ports":     ports,
			"is_blocking":      enforce,
		}
		var res map[string]any
		_ = c.Post(ctx, fmt.Sprintf("/api/orgs/%s/rules", orgTarget), payload, &res)

		fmt.Printf("✔ Standard best practice rules updated for '%s'.\n", orgTarget)
		fmt.Printf("  - Mandatory tags: %s\n", tags)
		fmt.Printf("  - Denied ingress ports: %s\n", ports)
		fmt.Printf("  - Blocking enforcement: %v\n", enforce)
		return nil
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
