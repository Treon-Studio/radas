// Package auth implements the `radas auth` command group: interactive login
// against the control plane, token refresh, credential status, and logout.
//
// Security model:
//
//   - Credentials persist in a 0600 file inside the RADAS config directory
//     (internal/auth store). No OS keychain library exists in go.mod, so the
//     restrictive file is the storage backend.
//   - The password is read from stdin (hidden when interactive) — never from
//     argv, so credentials cannot land in shell history.
//   - Tokens are never printed, logged, or embedded in error messages.
//   - The global --token flag / RADAS_TOKEN environment variable (resolved
//     by config.LoadRuntimeConfig) keeps winning over stored credentials so
//     CI flows stay exactly as they were before login existed.
//   - DoWithRefresh is the auto-refresh entry point for authenticated
//     commands: one 401-triggered refresh, one retry, credentials cleared
//     when the refresh itself is rejected.
package auth

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/raizora/radas/v4/internal/config"
)

// Typed auth-lifecycle errors. Callers and tests match with errors.Is.
var (
	// ErrInvalidCredentials is returned when the server rejects the login.
	ErrInvalidCredentials = errors.New("invalid username or password")
	// ErrMFAUnsupported is returned when the account requires a TOTP code;
	// the CLI does not prompt for one-time codes, so MFA login must be
	// completed from the web console.
	ErrMFAUnsupported = errors.New("MFA login requires the web console (the CLI does not prompt for TOTP codes); sign in from the console, or use --token/RADAS_TOKEN for CI")
	// ErrNotAuthenticated is returned when an authenticated call is made with
	// no stored credentials and no --token/RADAS_TOKEN override.
	ErrNotAuthenticated = errors.New("not authenticated: no stored credentials (run 'radas auth login', or set --token/RADAS_TOKEN for CI)")
	// ErrNoRefreshToken is returned by `auth refresh` when only an access
	// token (or nothing) is stored.
	ErrNoRefreshToken = errors.New("no refresh token stored (run 'radas auth login' first)")
	// ErrRefreshExpired is returned when the server rejects the stored
	// refresh token; the credentials have been cleared from disk.
	ErrRefreshExpired = errors.New("session expired: the refresh token was rejected and stored credentials were cleared (run 'radas auth login')")
)

// stdin and stdinIsTerminal are injectable so tests can drive the
// non-interactive path deterministically.
var (
	stdin           io.Reader = os.Stdin
	stdinIsTerminal           = func() bool {
		st, err := os.Stdin.Stat()
		return err == nil && (st.Mode()&os.ModeCharDevice) != 0
	}
)

// Cmd is the `radas auth` command group.
var Cmd = &cobra.Command{
	Use:   "auth",
	Short: "Authenticate the CLI against the RADAS control plane",
	Long: `Log in, refresh, inspect, and revoke CLI credentials.

Credentials are stored in a 0600 file under the RADAS config directory and
never printed. The global --token flag (or RADAS_TOKEN environment variable)
overrides stored credentials for CI. Login reads the password from stdin —
never from command-line arguments — so nothing lands in shell history.`,
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Log in and store CLI credentials",
	Long: `Prompts for a username and password (hidden input), exchanges them for
access/refresh tokens at POST /api/auth/login, and stores them with 0600
permissions. The --api-url flag (or RADAS_API_URL) selects the control plane.

For non-interactive use, pipe the credentials: echo -e "$USER\n$PASS" | radas auth login`,
	RunE: runLogin,
}

var refreshCmd = &cobra.Command{
	Use:   "refresh",
	Short: "Exchange the stored refresh token for a fresh access token",
	RunE:  runRefresh,
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show stored credential metadata (never the tokens)",
	RunE:  runStatus,
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Revoke the session on the server and clear stored credentials",
	RunE:  runLogout,
}

func init() {
	Cmd.AddCommand(loginCmd, refreshCmd, statusCmd, logoutCmd)
}

// --- login -------------------------------------------------------------------

type loginResponse struct {
	Success      bool   `json:"success"`
	MFARequired  bool   `json:"mfa_required"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ActiveOrgID  string `json:"active_org_id"`
	User         struct {
		Username string `json:"username"`
	} `json:"user"`
}

func runLogin(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()

	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return err
	}

	username, password, err := readLoginCredentials(stdin, out)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	c := rc.NewClient()
	rid := client.NewRequestID()
	resp, err := c.Do(ctx, http.MethodPost, "/api/auth/login",
		map[string]string{"username": username, "password": password},
		client.RequestOptions{RequestID: rid, IdempotencyKey: rid})
	if err != nil {
		return loginHTTPError(err)
	}

	var result loginResponse
	if err := resp.JSON(&result); err != nil {
		return fmt.Errorf("login: decode response (request %s): %w", rid, err)
	}

	// MFA-enrolled accounts receive mfa_required + a short-lived mfa_token
	// instead of access tokens. The CLI does not prompt for TOTP codes;
	// fail explicitly with console guidance and persist nothing.
	if result.MFARequired {
		return ErrMFAUnsupported
	}
	if !result.Success || result.AccessToken == "" || result.RefreshToken == "" {
		return fmt.Errorf("login: server returned no tokens (request %s)", rid)
	}

	displayName := result.User.Username
	if displayName == "" {
		displayName = username
	}

	store := cliauth.NewStore()
	if err := store.Save(cliauth.Credentials{
		APIURL:       rc.APIURL,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		Username:     displayName,
		SavedAt:      time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("store credentials: %w", err)
	}

	// Persist the server-resolved active organization to the CLI selector so
	// subsequent remote commands send the matching X-Org-Id without asking
	// again. The selector holds identifiers only and a login without org
	// context leaves any existing selection untouched.
	if err := persistActiveOrg(result.ActiveOrgID); err != nil {
		return fmt.Errorf("persist active organization: %w", err)
	}

	fmt.Fprintf(out, "✔ Logged in as %s (API: %s). Credentials stored with 0600 permissions; they are never printed.\n", displayName, rc.APIURL)
	return nil
}

// persistActiveOrg records the login response's active_org_id in the CLI
// selector, preserving any previously chosen project. An empty active org
// (the user has no organization yet) changes nothing.
func persistActiveOrg(activeOrgID string) error {
	if activeOrgID == "" {
		return nil
	}
	sel, err := config.LoadSelector()
	if err != nil {
		return err
	}
	sel.OrganizationID = activeOrgID
	return config.SaveSelector(sel)
}

// loginHTTPError converts a failed login request into typed errors. Server
// error bodies are sanitized user-facing messages (e.g. "Incorrect username
// or password") and are safe to surface; tokens are never in them.
func loginHTTPError(err error) error {
	var httpErr *client.HTTPError
	if !errors.As(err, &httpErr) {
		return fmt.Errorf("login: %w", err)
	}
	switch httpErr.StatusCode {
	case http.StatusUnauthorized, http.StatusBadRequest:
		return fmt.Errorf("login failed: %w: %s", ErrInvalidCredentials, serverErrorMessage(httpErr))
	default:
		return fmt.Errorf("login: %w", err)
	}
}

func serverErrorMessage(httpErr *client.HTTPError) string {
	var e struct {
		Error string `json:"error"`
	}
	if json.Unmarshal([]byte(httpErr.Body), &e) == nil && e.Error != "" {
		return e.Error
	}
	return strings.TrimSpace(httpErr.Body)
}

// readLoginCredentials reads the username and password. Interactively the
// password is read hidden (term.ReadPassword); from a pipe the two lines are
// read silently. The password never travels through argv.
func readLoginCredentials(in io.Reader, out io.Writer) (string, string, error) {
	reader := bufio.NewReader(in)

	if stdinIsTerminal() {
		fmt.Fprint(out, "Username: ")
		username, err := readLine(reader)
		if err != nil {
			return "", "", fmt.Errorf("read username: %w", err)
		}
		fmt.Fprint(out, "Password: ")
		raw, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(out)
		if err != nil {
			return "", "", fmt.Errorf("read password: %w", err)
		}
		if len(raw) == 0 {
			return "", "", errors.New("password is required")
		}
		return username, string(raw), nil
	}

	// Non-interactive (pipe/script): two silent lines, no prompts.
	username, err := readLine(reader)
	if err != nil {
		return "", "", fmt.Errorf("read username from stdin: %w", err)
	}
	password, err := readLine(reader)
	if err != nil {
		return "", "", fmt.Errorf("read password from stdin: %w", err)
	}
	return username, password, nil
}

func readLine(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		if err != nil {
			return "", err
		}
		return "", errors.New("empty input")
	}
	return trimmed, nil
}

// --- refresh -----------------------------------------------------------------

func runRefresh(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()

	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return err
	}

	store := cliauth.NewStore()
	creds, err := store.Load()
	if err != nil {
		return fmt.Errorf("auth refresh: %w", err)
	}
	if creds.RefreshToken == "" {
		return ErrNoRefreshToken
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := refreshStoredCredentials(ctx, store, &creds, baseURL(creds, rc)); err != nil {
		return err
	}

	fmt.Fprintf(out, "✔ Access token refreshed for %s (refresh token retained; it is never printed).\n", creds.Username)
	return nil
}

// refreshStoredCredentials performs the POST /api/auth/refresh exchange,
// persists the rotated access token, and — when the refresh token is
// rejected — clears the stored credentials and returns ErrRefreshExpired.
func refreshStoredCredentials(ctx context.Context, store *cliauth.Store, creds *cliauth.Credentials, base string) error {
	access, err := refreshAccessToken(ctx, base, creds.RefreshToken)
	if err != nil {
		if isUnauthorized(err) {
			_ = store.Clear()
			return ErrRefreshExpired
		}
		return fmt.Errorf("token refresh failed: %w", err)
	}

	creds.AccessToken = access
	creds.SavedAt = time.Now().UTC()
	if err := store.Save(*creds); err != nil {
		return fmt.Errorf("persist refreshed token: %w", err)
	}
	return nil
}

// refreshAccessToken exchanges a refresh token for a new access token. The
// refresh endpoint authenticates via the body, not the Authorization header.
func refreshAccessToken(ctx context.Context, base, refreshToken string) (string, error) {
	c := client.New(client.Config{BaseURL: base})
	resp, err := c.Do(ctx, http.MethodPost, "/api/auth/refresh",
		map[string]string{"refresh_token": refreshToken}, client.RequestOptions{})
	if err != nil {
		return "", err
	}

	var result struct {
		Success     bool   `json:"success"`
		AccessToken string `json:"access_token"`
	}
	if err := resp.JSON(&result); err != nil {
		return "", fmt.Errorf("decode refresh response: %w", err)
	}
	if !result.Success || result.AccessToken == "" {
		return "", errors.New("refresh response did not contain an access token")
	}
	return result.AccessToken, nil
}

func isUnauthorized(err error) bool {
	var httpErr *client.HTTPError
	return errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusUnauthorized
}

// baseURL prefers the URL the credentials were issued by, falling back to the
// resolved runtime configuration.
func baseURL(creds cliauth.Credentials, rc config.RuntimeConfig) string {
	if creds.APIURL != "" {
		return creds.APIURL
	}
	return rc.APIURL
}

// --- status -------------------------------------------------------------------

func runStatus(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()

	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return err
	}
	override := rc.Token != ""

	store := cliauth.NewStore()
	creds, loadErr := store.Load()

	fmt.Fprintf(out, "API URL:      %s\n", rc.APIURL)

	switch {
	case errors.Is(loadErr, cliauth.ErrNoCredentials):
		fmt.Fprintln(out, "Logged in as: —")
		fmt.Fprintln(out, "Not logged in (no stored credentials). Run 'radas auth login'.")
	case errors.Is(loadErr, cliauth.ErrCorruptCredentials):
		fmt.Fprintln(out, "Logged in as: —")
		fmt.Fprintln(out, "Stored credentials are corrupt (run 'radas auth logout' to reset them).")
	case loadErr != nil:
		return fmt.Errorf("auth status: %w", loadErr)
	case creds.Empty():
		fmt.Fprintln(out, "Logged in as: —")
		fmt.Fprintln(out, "Stored credentials hold no tokens (run 'radas auth login').")
	default:
		fmt.Fprintf(out, "Logged in as: %s\n", displayName(creds))
		if !creds.SavedAt.IsZero() {
			fmt.Fprintf(out, "Session saved: %s\n", creds.SavedAt.UTC().Format(time.RFC3339))
		}
		fmt.Fprintln(out, "Credentials:  stored credentials (tokens are never printed)")
		if exp, ok := accessTokenExpiry(creds.AccessToken); ok {
			fmt.Fprintf(out, "Access token: present, expires %s (decoded locally, unverified display only)\n", exp.UTC().Format(time.RFC3339))
		}
	}

	switch {
	case override:
		fmt.Fprintln(out, "Token source: --token flag / RADAS_TOKEN override is active (stored credentials are ignored; the value is never printed)")
	case loadErr == nil && !creds.Empty():
		fmt.Fprintln(out, "Token source: stored credentials")
	}
	return nil
}

// displayName returns the stored username, falling back to the username
// decoded from the access token payload. JWT claims are decoded WITHOUT
// verification and are display-only: they are never used for any
// authorization decision (the server re-validates every request).
func displayName(creds cliauth.Credentials) string {
	if creds.Username != "" {
		return creds.Username
	}
	claims, ok := decodeTokenClaims(creds.AccessToken)
	if !ok {
		return "unknown"
	}
	if name, ok := claims["username"].(string); ok && name != "" {
		return name
	}
	return "unknown"
}

func accessTokenExpiry(token string) (time.Time, bool) {
	claims, ok := decodeTokenClaims(token)
	if !ok {
		return time.Time{}, false
	}
	exp, ok := claims["exp"].(float64)
	if !ok {
		return time.Time{}, false
	}
	return time.Unix(int64(exp), 0), true
}

// decodeTokenClaims base64-decodes a JWT payload without verifying the
// signature or expiry. Display only — never for authorization decisions.
func decodeTokenClaims(token string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, false
	}
	var claims map[string]any
	if json.Unmarshal(payload, &claims) != nil {
		return nil, false
	}
	return claims, true
}

// --- logout -------------------------------------------------------------------

func runLogout(cmd *cobra.Command, args []string) error {
	out := cmd.OutOrStdout()

	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return err
	}
	store := cliauth.NewStore()
	creds, loadErr := store.Load()

	switch {
	case errors.Is(loadErr, cliauth.ErrCorruptCredentials):
		_ = store.Clear()
		fmt.Fprintln(out, "Stored credentials were corrupt and have been removed; nothing was revoked on the server.")
		return nil
	case loadErr != nil && !errors.Is(loadErr, cliauth.ErrNoCredentials):
		return fmt.Errorf("auth logout: %w", loadErr)
	}

	if rc.Token == "" && (errors.Is(loadErr, cliauth.ErrNoCredentials) || creds.AccessToken == "") {
		fmt.Fprintln(out, "Not logged in; nothing to revoke.")
		return nil
	}

	// Route through DoWithRefresh so an expired access token with a valid
	// refresh token can still revoke cleanly server-side.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err = DoWithRefresh(ctx, cmd, func(c *client.Client) (*client.Response, error) {
		return c.Do(ctx, http.MethodPost, "/api/auth/logout", nil, client.RequestOptions{})
	})

	switch {
	case err == nil:
		_ = store.Clear()
		fmt.Fprintln(out, "✔ Logged out: the presented token was revoked on the server and stored credentials were removed.")
	case errors.Is(err, ErrRefreshExpired), errors.Is(err, ErrNotAuthenticated), isUnauthorized(err):
		// The server no longer accepts the session (already revoked or
		// expired, and the refresh was rejected too). Local state must go.
		_ = store.Clear()
		fmt.Fprintln(out, "The server rejected the session (already invalid or expired); stored credentials were cleared.")
	default:
		return fmt.Errorf("auth logout: %w", err)
	}
	return nil
}

// --- auto-refresh wrapper -------------------------------------------------------

// DoWithRefresh performs one authenticated control-plane call using stored
// credentials. When the global --token flag / RADAS_TOKEN environment is set,
// it wins and the call is made exactly once with that token (CI behavior is
// unchanged). Otherwise, on a 401 with a stored refresh token, exactly one
// refresh is attempted and the call is retried once with the rotated access
// token (which is persisted). If the refresh itself is rejected, stored
// credentials are cleared and ErrRefreshExpired is returned.
//
// call must perform exactly one HTTP request. Do not route the login or
// refresh endpoints themselves through this wrapper.
func DoWithRefresh(ctx context.Context, cmd *cobra.Command, call func(c *client.Client) (*client.Response, error)) (*client.Response, error) {
	rc, err := config.LoadRuntimeConfig(cmd)
	if err != nil {
		return nil, err
	}

	// CI override: an explicit token from flag/environment always wins over
	// stored credentials and no refresh logic applies to a static token.
	if rc.Token != "" {
		return call(rc.NewClient())
	}

	store := cliauth.NewStore()
	creds, loadErr := store.Load()
	if loadErr != nil {
		// No (readable) stored credentials: make the call token-less so the
		// server's 401 surfaces as the typed not-authenticated error. The
		// tenant context still travels on the request — project-scoped
		// endpoints validate/scope on X-Project-Id regardless of auth state.
		resp, callErr := call(client.New(client.Config{
			BaseURL:        rc.APIURL,
			ProjectID:      rc.ProjectID,
			OrganizationID: rc.OrganizationID,
		}))
		if callErr != nil && isUnauthorized(callErr) {
			return nil, fmt.Errorf("%w", ErrNotAuthenticated)
		}
		return resp, callErr
	}

	base := baseURL(creds, rc)
	attempt := func() (*client.Response, error) {
		return call(client.New(client.Config{
			BaseURL:        base,
			AuthToken:      creds.AccessToken,
			ProjectID:      rc.ProjectID,
			OrganizationID: rc.OrganizationID,
		}))
	}

	resp, callErr := attempt()
	if callErr == nil || !isUnauthorized(callErr) || creds.RefreshToken == "" {
		return resp, callErr
	}

	// One refresh, then one retry with the rotated token.
	if err := refreshStoredCredentials(ctx, store, &creds, base); err != nil {
		return nil, err
	}
	return attempt()
}
