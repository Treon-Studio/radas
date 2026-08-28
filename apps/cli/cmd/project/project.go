// Package project implements the `radas project` command group for listing
// accessible projects and selecting the active project used by
// project-scoped CLI commands.
//
// The CLI stores the selection as a local identifier only (a selector): the
// server remains the authorization authority and validates organization
// membership and project access on every request. No token material is ever
// written to the selector or printed by these commands.
package project

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

// Cmd is the parent command for the project selection group.
var Cmd = &cobra.Command{
	Use:     "project",
	Aliases: []string{"projects"},
	Short:   "List accessible projects and select the active project context",
	Long: `The project command group lists projects served by the RADAS control plane
and selects the active project for subsequent commands. The selection is a
local identifier only: the server remains the authorization authority for
every request.`,
}

// ProjectInfo mirrors the fields of the server's GET /api/projects response
// that the CLI renders or stores.
type ProjectInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	OrgID      string `json:"orgId,omitempty"`
	IsArchived bool   `json:"isArchived,omitempty"`
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

// listProjects fetches the accessible projects from GET /api/projects through
// the shared credential resolution and returns them.
func listProjects(ctx context.Context, cmd *cobra.Command) ([]ProjectInfo, error) {
	var payload struct {
		Success  bool          `json:"success"`
		Projects []ProjectInfo `json:"projects"`
	}
	if _, err := callAPI(ctx, cmd, http.MethodGet, "/api/projects", nil, &payload); err != nil {
		return nil, err
	}
	if !payload.Success {
		return nil, fmt.Errorf("project list request rejected by server")
	}
	return payload.Projects, nil
}

var listCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List projects accessible to the authenticated user",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("🗂️ Fetching accessible projects from RADAS API...")
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		projects, err := listProjects(ctx, cmd)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("list projects: %w", err)
		}

		sel, err := config.LoadSelector()
		if err != nil {
			return err
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "PROJECT ID\tNAME\tORG ID\tACTIVE")
		for _, p := range projects {
			active := ""
			if p.ID == sel.ProjectID {
				active = "✔ ACTIVE"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", p.ID, p.Name, p.OrgID, active)
		}
		w.Flush()
		return nil
	},
}

var useCmd = &cobra.Command{
	Use:   "use <project-id>",
	Short: "Select the active project for subsequent commands",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		target := args[0]

		spin := utils.NewSpinner("🗂️ Resolving project on RADAS API...")
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		projects, err := listProjects(ctx, cmd)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("resolve project: %w", err)
		}

		var found *ProjectInfo
		for i := range projects {
			if projects[i].ID == target {
				found = &projects[i]
				break
			}
		}
		if found == nil {
			return fmt.Errorf("project '%s' not found in accessible projects; run 'radas project list' to see available IDs", target)
		}

		rc, err := config.LoadRuntimeConfig(cmd)
		if err != nil {
			return err
		}
		sel, err := config.LoadSelector()
		if err != nil {
			return err
		}
		sel.ProjectID = found.ID
		if rc.OrganizationID != "" {
			sel.OrganizationID = rc.OrganizationID
		} else if found.OrgID != "" {
			sel.OrganizationID = found.OrgID
		}
		if err := config.SaveSelector(sel); err != nil {
			return fmt.Errorf("persist project selection: %w", err)
		}

		fmt.Printf("✔ Active project set to '%s' (%s).\n", found.Name, found.ID)
		fmt.Println("Selection is stored locally as an identifier only; the server authorizes every request.")
		return nil
	},
}

func init() {
	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(useCmd)
}
