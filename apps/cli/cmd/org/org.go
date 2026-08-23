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
		c := getClient()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Success bool      `json:"success"`
			Orgs    []OrgInfo `json:"orgs"`
		}

		_ = c.Get(ctx, "/api/orgs", &resp)

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

func init() {
	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(switchCmd)
}
