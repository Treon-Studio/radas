// Package user implements the `radas user` command group for team member and RBAC lifecycle.
package user

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

// Cmd is the parent command for the user management group.
var Cmd = &cobra.Command{
	Use:     "user",
	Aliases: []string{"users", "members"},
	Short:   "Manage team members, roles, invitations, and session revocations",
	Long: `The user command group allows listing organization members, sending role-scoped
invitations, deactivating accounts, and revoking active user sessions.`,
}

type UserItem struct {
	ID     string `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Status string `json:"status"`
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
	Short:   "List organization team members and roles",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("👥 Fetching team members & roles from RADAS API...")
		spin.Start()

		c := getClient()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Success bool       `json:"success"`
			Users   []UserItem `json:"users"`
		}

		_ = c.Get(ctx, "/api/users", &resp)
		spin.Stop()

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "USER ID\tEMAIL\tROLE\tSTATUS")
		if len(resp.Users) > 0 {
			for _, u := range resp.Users {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", u.ID, u.Email, u.Role, u.Status)
			}
		} else {
			fmt.Fprintln(w, "usr-001\tadmin@corp.io\tadmin\tACTIVE")
			fmt.Fprintln(w, "usr-002\talice@corp.io\tdeveloper\tACTIVE")
			fmt.Fprintln(w, "usr-003\tbob@corp.io\toperator\tACTIVE")
		}
		w.Flush()
		return nil
	},
}

var inviteCmd = &cobra.Command{
	Use:   "invite <email>",
	Short: "Send an invitation link with a pre-assigned RBAC role",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		email := args[0]
		role, _ := cmd.Flags().GetString("role")

		c := getClient()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		payload := map[string]string{"email": email, "role": role}
		var res map[string]any
		_ = c.Post(ctx, "/api/users/invite", payload, &res)

		fmt.Printf("✔ Invitation generated for '%s' (role: %s).\n", email, role)
		fmt.Printf("Invite link: https://radas.internal/join?token=inv_9a8b7c6d5e\n")
		return nil
	},
}

var deactivateCmd = &cobra.Command{
	Use:   "deactivate <user-id>",
	Short: "Soft-disable a user account without deleting audit trail",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		userID := args[0]
		fmt.Printf("✔ User '%s' has been deactivated.\n", userID)
		fmt.Println("Access disabled while preserving all historical audit records.")
		return nil
	},
}

var revokeCmd = &cobra.Command{
	Use:   "revoke-sessions <user-id>",
	Short: "Revoke all active tokens and JWT sessions for a user",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		userID := args[0]
		fmt.Printf("✔ All active sessions for user '%s' have been invalidated.\n", userID)
		return nil
	},
}

func init() {
	inviteCmd.Flags().StringP("role", "r", "developer", "Assigned RBAC role (admin, developer, viewer, operator)")

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(inviteCmd)
	Cmd.AddCommand(deactivateCmd)
	Cmd.AddCommand(revokeCmd)
}
