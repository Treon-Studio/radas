// Package user implements the `radas user` command group for team member and RBAC lifecycle.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print success text when the server call fails.
package user

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the user management group.
var Cmd = &cobra.Command{
	Use:     "user",
	Aliases: []string{"users", "members"},
	Short:   "Manage team members, roles, invitations, and session revocations",
	Long: `The user command group allows listing organization members, sending role-scoped
invitations, deactivating accounts, and revoking active user sessions.`,
}

// UserItem mirrors the string fields of the server's user record
// (api/users_routes.py user.to_dict()); role arrays are decoded as names only.
type UserItem struct {
	ID        string   `json:"id"`
	Email     string   `json:"email"`
	Username  string   `json:"username"`
	IsActive  *bool    `json:"is_active"`
	RoleNames []string `json:"role_names"`
}

func (u UserItem) status() string {
	if u.IsActive == nil {
		return "unknown"
	}
	if *u.IsActive {
		return "ACTIVE"
	}
	return "INACTIVE"
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
	Short:   "List organization team members and roles",
	RunE: func(cmd *cobra.Command, args []string) error {
		spin := utils.NewSpinner("👥 Fetching team members & roles from RADAS API...")
		spin.Start()

		c, err := getClient(cmd)
		if err != nil {
			spin.Stop()
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var resp struct {
			Success bool       `json:"success"`
			Users   []UserItem `json:"users"`
		}
		_, err = doAPI(ctx, c, http.MethodGet, "/api/users", nil, &resp)
		spin.Stop()
		if err != nil {
			return fmt.Errorf("user list: %w", err)
		}

		if len(resp.Users) == 0 {
			fmt.Println("No team members found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "USER ID\tEMAIL\tROLES\tSTATUS")
		for _, u := range resp.Users {
			roles := "-"
			if len(u.RoleNames) > 0 {
				roles = joinRoles(u.RoleNames)
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", u.ID, u.Email, roles, u.status())
		}
		w.Flush()
		return nil
	},
}

var inviteCmd = &cobra.Command{
	Use:   "invite <email>",
	Short: "Create an invitation with pre-assigned RBAC roles",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		email := args[0]
		role, _ := cmd.Flags().GetString("role")

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The control plane creates invites at POST /api/users/invites with
		// an email plus a roles array, and returns the real invite record
		// (token, expiry). The token is the shareable invite credential this
		// command exists to hand out, so it is printed to the inviter only.
		payload := map[string]any{"email": email, "roles": []string{role}}
		var res struct {
			Success bool `json:"success"`
			Invite  struct {
				Token     string `json:"token"`
				Email     string `json:"email"`
				Status    string `json:"status"`
				ExpiresAt any    `json:"expires_at"`
			} `json:"invite"`
		}
		if _, err := doAPI(ctx, c, http.MethodPost, "/api/users/invites", payload, &res); err != nil {
			return fmt.Errorf("user invite: %w", err)
		}

		fmt.Printf("✔ Invitation created for '%s' (role: %s, status: %s).\n", res.Invite.Email, role, res.Invite.Status)
		if res.Invite.Token != "" {
			fmt.Printf("Invite token (share with the invitee): %s\n", res.Invite.Token)
		}
		if res.Invite.ExpiresAt != nil {
			fmt.Printf("Invite expires_at: %v\n", res.Invite.ExpiresAt)
		}
		return nil
	},
}

var deactivateCmd = &cobra.Command{
	Use:   "deactivate <user-id>",
	Short: "Soft-disable a user account (is_active=false) without deleting audit trail",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		userID := args[0]

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Deactivation maps to PUT /api/users/<id> {"is_active": false}.
		payload := map[string]any{"is_active": false}
		var res struct {
			Success bool `json:"success"`
			User    struct {
				ID       string `json:"id"`
				IsActive *bool  `json:"is_active"`
			} `json:"user"`
		}
		if _, err := doAPI(ctx, c, http.MethodPut, fmt.Sprintf("/api/users/%s", userID), payload, &res); err != nil {
			return fmt.Errorf("user deactivate: %w", err)
		}

		fmt.Printf("✔ User '%s' has been deactivated (server confirmed).\n", userID)
		fmt.Println("Access disabled while preserving all historical audit records.")
		return nil
	},
}

var revokeCmd = &cobra.Command{
	Use:   "revoke-sessions <user-id>",
	Short: "Revoke all active tokens and JWT sessions for a user",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("user revoke-sessions is not available: the control plane only offers POST /api/auth/revoke-all-sessions for the *current* user's sessions; there is no per-user revocation route, so nothing was revoked")
	},
}

func init() {
	inviteCmd.Flags().StringP("role", "r", "developer", "Assigned RBAC role (admin, developer, viewer, operator)")

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(inviteCmd)
	Cmd.AddCommand(deactivateCmd)
	Cmd.AddCommand(revokeCmd)
}

// joinRoles renders role names comma-separated.
func joinRoles(roles []string) string {
	out := ""
	for i, r := range roles {
		if i > 0 {
			out += ", "
		}
		out += r
	}
	return out
}
