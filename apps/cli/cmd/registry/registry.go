// Package registry implements the `radas registry` command group for BYOC code registry management.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package registry

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the code registry group.
var Cmd = &cobra.Command{
	Use:     "registry",
	Aliases: []string{"reg"},
	Short:   "Discover, adopt, and publish reusable OpenTofu modules and Ansible roles",

	Example: `  # List reusable modules and roles
  radas registry list

  # Install a module into a stack
  radas registry install tofu/vpc --stack prod-net`,
	Long: `The registry command group provides shadcn-style code adoption for OpenTofu
blocks and Ansible roles. The catalog and installs are served by the RADAS
control plane; installs target a stack directory on the server.`,
}

type RegistryItem struct {
	Type        string   `json:"type"`
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Description string   `json:"description"`
	Tags        []string `json:"tags,omitempty"`
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
	Long:    `List reusable OpenTofu modules and Ansible roles available in the registry.`,
	Example: `  radas registry list`,
	Aliases: []string{"ls"},
	Short:   "List available OpenTofu modules and Ansible roles",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Items []RegistryItem `json:"items"`
		}
		// The control plane serves the catalog at GET /api/registry.
		_, err := callAPI(ctx, cmd, http.MethodGet, "/api/registry", nil, &resp)
		if err != nil {
			return fmt.Errorf("registry list: %w", err)
		}

		if len(resp.Items) == 0 {
			fmt.Println("No registry items found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TYPE\tSLUG\tVERSION\tDESCRIPTION")
		for _, item := range resp.Items {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", item.Type, item.Slug, item.Version, item.Description)
		}
		w.Flush()
		return nil
	},
}

var installCmd = &cobra.Command{
	Use:     "install <type/slug>",
	Long:    `Install a registry module or role into a stack (--stack is required).`,
	Example: `  radas registry install tofu/vpc --stack prod-net`,
	Short:   "Install a module or role from the registry into a stack",
	Args:    cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		target := args[0]
		stack, _ := cmd.Flags().GetString("stack")
		version, _ := cmd.Flags().GetString("version")

		if stack == "" {
			return fmt.Errorf("registry install requires --stack <stack-name>: the control plane installs registry items into a server-side stack (POST /api/registry/<name>/install)")
		}

		// The server addresses items by name; accept the "<type>/<slug>"
		// shorthand and use the last path segment as the item name.
		name := target
		if i := strings.LastIndex(target, "/"); i >= 0 {
			name = target[i+1:]
		}

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		payload := map[string]string{"stack": stack}
		if version != "" {
			payload["version"] = version
		}
		var res struct {
			Success   bool           `json:"success"`
			Installed map[string]any `json:"installed"`
		}
		_, err := callAPI(ctx, cmd, http.MethodPost, fmt.Sprintf("/api/registry/%s/install", name), payload, &res)
		if err != nil {
			return fmt.Errorf("registry install: %w", err)
		}

		fmt.Printf("✔ Installed '%s' into stack '%s' (server confirmed).\n", name, stack)
		return nil
	},
}

var publishCmd = &cobra.Command{
	Use: "publish [dir]",
	Long: `Publish a local module directory to the private org registry.

NOT YET AVAILABLE: publishing currently happens server-side from managed stacks only.`,
	Example: `  radas registry publish ./modules/vpc`,
	Short:   "Publish a reusable module or role from a local directory to the private registry",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("registry publish is not available: the control plane publishes bundles from server-side stacks (POST /api/registry/publish with stack, name, and file_patterns), not from local directories; nothing was published")
	},
}

func init() {
	installCmd.Flags().String("stack", "", "Target stack name on the control plane (required)")
	installCmd.Flags().String("version", "", "Install a specific version instead of the latest")

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(installCmd)
	Cmd.AddCommand(publishCmd)
}
