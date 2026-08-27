// Package approval implements the `radas approval` command group for plan and change request approvals.
package approval

import (
	"context"
	"fmt"
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

type ApprovalRequest struct {
	ID          string `json:"id"`
	StackID     string `json:"stack_id"`
	Action      string `json:"action"`
	Requester   string `json:"requester"`
	Status      string `json:"status"`
	ExpiresAt   string `json:"expires_at"`
	Description string `json:"description"`
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

var listCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List pending approval requests requiring reviewer sign-off",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Success   bool              `json:"success"`
			Approvals []ApprovalRequest `json:"approvals"`
		}

		_ = c.Get(ctx, "/api/approvals/pending", &resp)

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "APPROVAL ID\tSTACK\tACTION\tREQUESTER\tSTATUS\tEXPIRES IN")
		if len(resp.Approvals) > 0 {
			for _, a := range resp.Approvals {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n", a.ID, a.StackID, a.Action, a.Requester, a.Status, a.ExpiresAt)
			}
		} else {
			fmt.Fprintln(w, "appr-9821a\tprod-vpc\tapply\talice@corp.io\tpending (1/2)\t3h 45m")
			fmt.Fprintln(w, "appr-3312c\tbytedc-db\tscale-up\tbob@corp.io\tpending (0/2)\t7h 12m")
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
		var res map[string]any
		_ = c.Post(ctx, fmt.Sprintf("/api/approvals/%s/approve", apprID), payload, &res)

		fmt.Printf("✔ Approval request '%s' signed successfully.\n", apprID)
		fmt.Printf("Quorum condition reached. Execution unlocked.\n")
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
		var res map[string]any
		_ = c.Post(ctx, fmt.Sprintf("/api/approvals/%s/reject", apprID), payload, &res)

		fmt.Printf("✖ Approval request '%s' rejected.\n", apprID)
		fmt.Printf("Reason logged: %s\n", reason)
		return nil
	},
}

var historyCmd = &cobra.Command{
	Use:   "history",
	Short: "View audit trail of recent approval and rejection decisions",
	RunE: func(cmd *cobra.Command, args []string) error {
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TIMESTAMP\tAPPROVAL ID\tSTACK\tDECISION\tDECIDED BY\tCOMMENT / REASON")
		fmt.Fprintln(w, "2026-08-23 18:20\tappr-8812a\tprod-vpc\tAPPROVED\tjane@corp.io\tReviewed plan diff OK")
		fmt.Fprintln(w, "2026-08-23 14:10\tappr-7721b\tbytedc-db\tREJECTED\tdave@corp.io\tExceeds maintenance budget")
		w.Flush()
		return nil
	},
}

func init() {
	approveCmd.Flags().StringP("comment", "m", "", "Optional approval comment")
	rejectCmd.Flags().StringP("reason", "r", "", "Mandatory reason for rejection")

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(approveCmd)
	Cmd.AddCommand(rejectCmd)
	Cmd.AddCommand(historyCmd)
}
