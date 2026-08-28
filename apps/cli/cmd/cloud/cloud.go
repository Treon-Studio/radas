// Package cloud implements the `radas cloud` command group for BYOC multi-cloud discovery and adoption.
//
// Commands that are not yet backed by a control-plane endpoint fail
// explicitly instead of fabricating remote state. cloud diff is wired to the
// real per-stack drift endpoint; cloud import is a purely local generator and
// is labeled as such.
package cloud

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

// Cmd is the parent command for the cloud/BYOC group.
var Cmd = &cobra.Command{
	Use:     "cloud",
	Aliases: []string{"byoc", "provider"},
	Short:   "Discover cloud resources, probe credentials, and import existing infrastructure",
	Long: `The cloud command group enables Bring-Your-Own-Cloud (BYOC) account adoption.
Credential validation and resource inventory run server-side against a
registered BYOC account; this CLI does not fabricate probe or inventory
results locally.`,
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

var probeCmd = &cobra.Command{
	Use:   "probe <provider>",
	Short: "Probe connection and IAM credentials for a cloud provider (aws, gcp, azure, bytedc, cloudflare, kubernetes)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		provider := args[0]
		return fmt.Errorf("cloud probe for '%s' is not available: the control plane validates credentials server-side for registered BYOC accounts only, and no provider probe endpoint is exposed yet; register the account in the RADAS console so validation happens there", provider)
	},
}

var inventoryCmd = &cobra.Command{
	Use:     "inventory",
	Aliases: []string{"inv"},
	Short:   "List discovered cloud resources and check management status",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("cloud inventory is not wired yet in this CLI (no server call made): the control plane serves inventory per stack at GET /api/cloud/stacks/<name>/inventory (project-scoped, no BYOC account required) and separately per registered BYOC account at GET /api/byoc/accounts/<account_id>/inventory; this command does not yet accept a stack or account selector, so no inventory can be shown")
	},
}

var importCmd = &cobra.Command{
	Use:   "import <resource-type> <tf-address> <cloud-id>",
	Short: "Generate OpenTofu import block and CLI command for an unmanaged cloud resource",
	Args:  cobra.ExactArgs(3),
	RunE: func(cmd *cobra.Command, args []string) error {
		resType := args[0]
		tfAddr := args[1]
		cloudID := args[2]

		// Local-only text generation from the caller's arguments: no server
		// call, no remote state claimed.
		fmt.Printf("Generated OpenTofu import block locally (no server call) for '%s':\n\n", resType)
		fmt.Printf("import {\n")
		fmt.Printf("  to = %s\n", tfAddr)
		fmt.Printf("  id = \"%s\"\n", cloudID)
		fmt.Printf("}\n\n")
		fmt.Printf("CLI Command:\n")
		fmt.Printf("  tofu import %s %s\n", tfAddr, cloudID)
		return nil
	},
}

var diffCmd = &cobra.Command{
	Use:   "diff <stack-id>",
	Short: "Show the server-side drift status of a stack's real-world cloud inventory",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]
		spin := utils.NewSpinner(fmt.Sprintf("🔍 Fetching drift status for stack '%s' from RADAS API...", stackID))
		spin.Start()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var res struct {
			Enabled       bool   `json:"enabled"`
			Status        string `json:"status"`
			LastRunID     string `json:"last_run_id"`
			LastCheckedAt any    `json:"last_checked_at"`
			ReturnCode    any    `json:"returncode"`
		}
		_, err := callAPI(ctx, cmd, http.MethodGet, fmt.Sprintf("/api/cloud/stacks/%s/drift", stackID), nil, &res)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("cloud diff: %w", err)
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "FIELD\tVALUE")
		fmt.Fprintf(w, "Drift detection\tenabled\n")
		fmt.Fprintf(w, "Status\t%s\n", res.Status)
		if res.LastRunID != "" {
			fmt.Fprintf(w, "Last drift run\t%s\n", res.LastRunID)
		}
		if res.LastCheckedAt != nil {
			fmt.Fprintf(w, "Last checked at\t%v\n", res.LastCheckedAt)
		}
		if res.ReturnCode != nil {
			fmt.Fprintf(w, "Return code\t%v\n", res.ReturnCode)
		}
		w.Flush()
		return nil
	},
}

func init() {
	Cmd.AddCommand(probeCmd)
	Cmd.AddCommand(inventoryCmd)
	Cmd.AddCommand(importCmd)
	Cmd.AddCommand(diffCmd)
}
