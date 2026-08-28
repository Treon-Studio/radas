// Package audit implements the `radas audit` command group for security event logging and compliance export.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print fabricated results when the server call fails.
package audit

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// Cmd is the parent command for the audit event group.
var Cmd = &cobra.Command{
	Use:     "audit",
	Aliases: []string{"logs", "events"},
	Short:   "Query audit trails, export logs, and generate compliance evidence",
	Long: `The audit command group queries the project-scoped audit log served by the
RADAS control plane (GET /api/audit-log), exports it via the real export
endpoint, and prints the live compliance report (GET /api/compliance/report).`,
}

// AuditEvent mirrors the server's audit entry (storage/auth_db.py list_audit):
// only the string fields the CLI renders are decoded.
type AuditEvent struct {
	ID          string `json:"id"`
	ActorUserID string `json:"actor_user_id"`
	Action      string `json:"action"`
	TargetType  string `json:"target_type"`
	TargetID    string `json:"target_id"`
	CreatedAt   string `json:"created_at"`
}

// auditListResponse is the shared {entries: [...]} shape of GET /api/audit-log
// and GET /api/audit/search.
type auditListResponse struct {
	Entries []AuditEvent `json:"entries"`
}

// callAPI performs one authenticated control-plane call through the shared
// credential resolution (auth.DoWithRefresh): the --token flag / RADAS_TOKEN
// environment wins for CI, stored `radas auth login` credentials are
// presented otherwise and auto-refreshed once on a 401, and with neither
// source the server's 401 surfaces as the typed auth.ErrNotAuthenticated.
// The project context (X-Project-Id) always travels on the request — the
// server requires it to scope /api/audit-log regardless of auth state.
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
	Aliases: []string{"ls", "search"},
	Short:   "List audit events for the selected project, with optional filters",
	RunE: func(cmd *cobra.Command, args []string) error {
		action, _ := cmd.Flags().GetString("action")
		user, _ := cmd.Flags().GetString("user")
		limit, _ := cmd.Flags().GetInt("limit")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The control plane serves the audit log at GET /api/audit-log.
		// Action-filtered queries use GET /api/audit/search, which supports
		// the action filter; actor filters are supported by both.
		var (
			listResp  auditListResponse
			searchRes auditListResponse
			target    any = &listResp
			path      string
		)
		params := url.Values{}
		if user != "" {
			params.Set("actor_user_id", user)
		}
		params.Set("limit", fmt.Sprintf("%d", limit))
		if action != "" {
			params.Set("action", action)
			path = "/api/audit/search?" + params.Encode()
			target = &searchRes
		} else {
			path = "/api/audit-log?" + params.Encode()
		}
		if _, err := callAPI(ctx, cmd, http.MethodGet, path, nil, target); err != nil {
			return fmt.Errorf("audit list: %w", err)
		}
		events := listResp.Entries
		if action != "" {
			events = searchRes.Entries
		}

		if len(events) == 0 {
			fmt.Println("No audit events found.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TIMESTAMP\tACTOR\tACTION\tTARGET")
		for _, e := range events {
			target := e.TargetID
			if e.TargetType != "" {
				target = e.TargetType + "/" + e.TargetID
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", e.CreatedAt, e.ActorUserID, e.Action, target)
		}
		w.Flush()
		return nil
	},
}

var exportCmd = &cobra.Command{
	Use:   "export",
	Short: "Export audit logs to CSV or JSONL via the control-plane export endpoint",
	RunE: func(cmd *cobra.Command, args []string) error {
		format, _ := cmd.Flags().GetString("format")
		outFile, _ := cmd.Flags().GetString("out")
		limit, _ := cmd.Flags().GetInt("limit")

		if format != "csv" && format != "jsonl" {
			return fmt.Errorf("unsupported format %q (the control-plane export endpoint serves csv or jsonl)", format)
		}
		if outFile == "" {
			outFile = fmt.Sprintf("audit_export_%d.%s", time.Now().Unix(), format)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// GET /api/audit-log/export returns the export document (csv or
		// jsonl); the CLI writes exactly what the server produced. The call
		// goes through the shared credential resolution like every other
		// command; the raw body is returned undecoded.
		rid := client.NewRequestID()
		path := fmt.Sprintf("/api/audit-log/export?format=%s&limit=%d", url.QueryEscape(format), limit)
		resp, err := auth.DoWithRefresh(ctx, cmd, func(c *client.Client) (*client.Response, error) {
			return c.Do(ctx, http.MethodGet, path, nil, client.RequestOptions{RequestID: rid})
		})
		if err != nil {
			return fmt.Errorf("GET %s failed (request %s): %w", path, rid, err)
		}
		if err := os.WriteFile(outFile, resp.Body, 0o644); err != nil {
			return fmt.Errorf("write export file %s: %w", outFile, err)
		}

		lines := countRecords(resp.Body, format)
		fmt.Printf("✔ Exported audit log to '%s' (format: %s, %d records from the server).\n", outFile, format, lines)
		return nil
	},
}

var evidenceCmd = &cobra.Command{
	Use:   "evidence",
	Short: "Print the live compliance report for the selected project",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		var report struct {
			Scorecard struct {
				Score  *float64 `json:"score"`
				Max    *float64 `json:"max"`
				Checks []struct {
					ID     string `json:"id"`
					Label  string `json:"label"`
					OK     bool   `json:"ok"`
					Detail string `json:"detail"`
				} `json:"checks"`
			} `json:"scorecard"`
		}
		if _, err := callAPI(ctx, cmd, http.MethodGet, "/api/compliance/report", nil, &report); err != nil {
			return fmt.Errorf("audit evidence: %w", err)
		}

		fmt.Println("Compliance evidence report (served by the RADAS control plane):")
		if report.Scorecard.Score != nil {
			maxScore := 100.0
			if report.Scorecard.Max != nil {
				maxScore = *report.Scorecard.Max
			}
			fmt.Printf("  Score: %.0f / %.0f\n", *report.Scorecard.Score, maxScore)
		}
		for _, chk := range report.Scorecard.Checks {
			status := "PASS"
			if !chk.OK {
				status = "FAIL"
			}
			line := fmt.Sprintf("  [%s] %s", status, chk.Label)
			if chk.Detail != "" {
				line += " (" + chk.Detail + ")"
			}
			fmt.Println(line)
		}
		if len(report.Scorecard.Checks) == 0 {
			fmt.Println("  (no compliance checks recorded for this project)")
		}
		return nil
	},
}

func init() {
	listCmd.Flags().StringP("action", "a", "", "Filter by action (substring match, served by /api/audit/search)")
	listCmd.Flags().StringP("user", "u", "", "Filter by actor user ID or email")
	listCmd.Flags().IntP("limit", "l", 100, "Maximum number of events to fetch (1-1000)")
	exportCmd.Flags().StringP("format", "f", "csv", "Export format (csv or jsonl)")
	exportCmd.Flags().StringP("out", "o", "", "Output file path")
	exportCmd.Flags().IntP("limit", "l", 1000, "Maximum number of events to export")

	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(exportCmd)
	Cmd.AddCommand(evidenceCmd)
}

// countRecords counts the data records in an export body. CSV exports always
// carry a header row (which is not a record) and quoted fields may contain
// newlines, so the body is parsed with encoding/csv. JSONL exports are
// newline-delimited JSON objects: every non-empty line is one record.
func countRecords(body []byte, format string) int {
	if format == "csv" {
		return countCSVRecords(body)
	}
	count := 0
	for _, line := range strings.Split(string(body), "\n") {
		if strings.TrimSpace(line) != "" {
			count++
		}
	}
	return count
}

func countCSVRecords(body []byte) int {
	r := csv.NewReader(bytes.NewReader(body))
	// The trailing meta column is free-form; rows are records regardless of
	// field-count variations.
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		// Best effort for bodies encoding/csv cannot parse: count non-empty
		// lines and drop the header row the server always writes first.
		n := 0
		for _, line := range strings.Split(string(body), "\n") {
			if strings.TrimSpace(line) != "" {
				n++
			}
		}
		if n > 0 {
			n--
		}
		return n
	}
	if len(rows) == 0 {
		return 0
	}
	return len(rows) - 1 // row 0 is the header
}
