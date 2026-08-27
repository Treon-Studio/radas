// Package approval implements the `radas approval` command group for plan and change request approvals.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package approval

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the approval group.
var Cmd = &cobra.Command{
	Use:     "approval",
	Aliases: []string{"approve", "approvals"},
	Short:   "Review, approve, and reject infrastructure change requests",
	Long: `The approval command group enables multi-party quorum reviews, approval TTL
tracking, and mandatory rejection reason logging for speculative execution plans.`,
}

// ApprovalRequest mirrors the string fields of the server's approval record
// (services/approval_service.py). Numeric timestamps (created_at, expires_at)
// are deliberately not decoded: the CLI does not render them.
type ApprovalRequest struct {
	ID          string `json:"id"`
	Stack       string `json:"stack"`
	Action      string `json:"action"`
	RequestedBy string `json:"requested_by"`
	Status      string `json:"status"`
	Note        string `json:"note"`
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
	Short:   "List approval requests, optionally filtered by status",
	RunE: func(cmd *cobra.Command, args []string) error {
		status, _ := cmd.Flags().GetString("status")

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The control plane serves approvals at GET /api/approvals (optional
		// ?status=); there is no /api/approvals/pending route.
		path := "/api/approvals"
		if status != "" {
			path = fmt.Sprintf("/api/approvals?status=%s", status)
		}
		var resp struct {
			Approvals []ApprovalRequest `json:"approvals"`
		}
		if _, err := doAPI(ctx, c, http.MethodGet, path, nil, &resp); err != nil {
			return fmt.Errorf("approval list: %w", err)
		}

		if len(resp.Approvals) == 0 {
			fmt.Println("No approval requests found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "APPROVAL ID\tSTACK\tACTION\tREQUESTED BY\tSTATUS\tNOTE")
		for _, a := range resp.Approvals {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n", a.ID, a.Stack, a.Action, a.RequestedBy, a.Status, a.Note)
		}
		w.Flush()
		return nil
	},
}

var approveCmd = &cobra.Command{
	Use:   "approve <approval-id>",
	Short: "Approve a pending change request",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		apprID := args[0]
		comment, _ := cmd.Flags().GetString("comment")

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		payload := map[string]string{"action": "approve", "comment": comment}
		var res struct {
			Success  bool            `json:"success"`
			Approval ApprovalRequest `json:"approval"`
		}
		if _, err := doAPI(ctx, c, http.MethodPost, fmt.Sprintf("/api/approvals/%s/approve", apprID), payload, &res); err != nil {
			return fmt.Errorf("approval approve: %w", err)
		}

		fmt.Printf("✔ Approval request '%s' signed successfully.\n", apprID)
		fmt.Printf("Status: %s\n", res.Approval.Status)
		return nil
	},
}

var rejectCmd = &cobra.Command{
	Use:   "reject <approval-id>",
	Short: "Reject a pending change request with a mandatory reason",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		apprID := args[0]
		reason, _ := cmd.Flags().GetString("reason")
		if reason == "" {
			return fmt.Errorf("a non-empty --reason is mandatory when rejecting an approval request")
		}

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		payload := map[string]string{"action": "reject", "reason": reason}
		var res struct {
			Success  bool            `json:"success"`
			Approval ApprovalRequest `json:"approval"`
		}
		if _, err := doAPI(ctx, c, http.MethodPost, fmt.Sprintf("/api/approvals/%s/reject", apprID), payload, &res); err != nil {
			return fmt.Errorf("approval reject: %w", err)
		}

		fmt.Printf("✖ Approval request '%s' rejected.\n", apprID)
		fmt.Printf("Reason logged: %s\n", reason)
		return nil
	},
}

var historyCmd = &cobra.Command{
	Use:   "history",
	Short: "View audit trail of recent approval and rejection decisions",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("approval history is not available: the control plane has no approval-decision-history route; nothing was fetched")
	},
}

func init() {
	listCmd.Flags().StringP("status", "s", "", "Filter by status (pending, approved, rejected)")
	approveCmd.Flags().StringP("comment", "m", "", "Optional approval comment")
	rejectCmd.Flags().StringP("reason", "r", "", "Mandatory reason for rejection")

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(approveCmd)
	Cmd.AddCommand(rejectCmd)
	Cmd.AddCommand(historyCmd)
}
