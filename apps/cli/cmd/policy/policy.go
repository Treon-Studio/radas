// Package policy implements the `radas policy` command group for policy-as-code and guardrails.
//
// The control plane serves recorded policy violations (GET
// /api/cloud/policy/violations); there is no policy evaluation or exemption
// endpoint, so those commands fail explicitly instead of fabricating results.
package policy

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the policy guardrail group.
var Cmd = &cobra.Command{
	Use:     "policy",
	Aliases: []string{"guard", "guardrails"},
	Short:   "Inspect policy violations recorded by the control plane",
	Long: `The policy command group reports the policy violations the control plane
recorded during stack runs (UC547). Policy evaluation and exemptions are
server-side concerns; the CLI never fabricates rule results.`,
}

// Violation mirrors the server's violation record (services/cloud_policy.py
// record_policy_violations); the numeric created_at is not decoded.
type Violation struct {
	Stack    string `json:"stack"`
	RuleID   string `json:"rule_id"`
	Severity string `json:"severity"`
	Resource string `json:"resource"`
	Message  string `json:"message"`
	RunID    string `json:"run_id"`
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

var checkCmd = &cobra.Command{
	Use:   "check [stack-id]",
	Short: "Run policy-as-code checks on a stack or local plan",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("policy check is not available: policy evaluation happens server-side during stack runs and the control plane has no on-demand evaluation endpoint; nothing was evaluated")
	},
}

var violationsCmd = &cobra.Command{
	Use:     "violations",
	Aliases: []string{"viols"},
	Short:   "List policy violations recorded across stacks",
	RunE: func(cmd *cobra.Command, args []string) error {
		stack, _ := cmd.Flags().GetString("stack")
		severity, _ := cmd.Flags().GetString("severity")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		path := "/api/cloud/policy/violations"
		if stack != "" {
			path = fmt.Sprintf("%s?stack=%s", path, stack)
		}
		if severity != "" {
			sep := "?"
			if stack != "" {
				sep = "&"
			}
			path = fmt.Sprintf("%s%sseverity=%s", path, sep, severity)
		}

		var resp struct {
			Count      int         `json:"count"`
			Violations []Violation `json:"violations"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodGet, path, nil, &resp); err != nil {
			return fmt.Errorf("policy violations: %w", err)
		}

		if len(resp.Violations) == 0 {
			fmt.Println("No policy violations recorded.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "RULE ID\tSEVERITY\tSTACK\tRESOURCE\tMESSAGE")
		for _, v := range resp.Violations {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", v.RuleID, v.Severity, v.Stack, v.Resource, v.Message)
		}
		w.Flush()
		return nil
	},
}

var exemptCmd = &cobra.Command{
	Use:   "exempt <rule-id> <stack-id>",
	Short: "Request or grant a temporary policy exemption with justification and TTL",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("policy exempt is not available: the control plane has no policy exemption endpoint (POST /api/policies/exemptions is not registered), so no exemption was created")
	},
}

func init() {
	violationsCmd.Flags().String("stack", "", "Filter violations by stack name")
	violationsCmd.Flags().String("severity", "", "Filter violations by severity")

	Cmd.AddCommand(checkCmd)
	Cmd.AddCommand(violationsCmd)
	Cmd.AddCommand(exemptCmd)
}
