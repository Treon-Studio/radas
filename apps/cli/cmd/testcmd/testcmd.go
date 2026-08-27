// Package testcmd implements the `radas test` command group for automated test suites and idempotency.
//
// Every remote operation goes through the real control-plane API and surfaces
// failures as errors with the request ID for server-side log correlation.
// None of the commands print fabricated test results.
package testcmd

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

// Cmd is the parent command for the test execution group.
var Cmd = &cobra.Command{
	Use:     "test",
	Aliases: []string{"tests"},
	Short:   "List, run, and score the control-plane test cases for a project",
	Long: `The test command group manages the test cases registered on the RADAS control
plane (.tftest.hcl assertions, policy assertions, idempotency checks): listing
(GET /api/tests), queueing runs (POST /api/tests/<id>/run), and computing the
stack security score (GET /api/test-cases/score).`,
}

// TestCase mirrors the fields of the control-plane test case rows the CLI
// renders (services/test_cases.list_test_cases).
type TestCase struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Stack   string `json:"stack"`
	Enabled *bool  `json:"enabled"`
}

func (tc TestCase) status() string {
	if tc.Enabled == nil {
		return "unknown"
	}
	if *tc.Enabled {
		return "enabled"
	}
	return "disabled"
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

// listTestCases fetches the project's test cases from GET /api/tests.
func listTestCases(ctx context.Context, c *client.Client) ([]TestCase, error) {
	var resp struct {
		TestCases []TestCase `json:"test_cases"`
	}
	if _, err := doAPI(ctx, c, http.MethodGet, "/api/tests", nil, &resp); err != nil {
		return nil, err
	}
	return resp.TestCases, nil
}

var listCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls", "cases"},
	Short:   "List the test cases registered on the control plane",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		cases, err := listTestCases(ctx, c)
		if err != nil {
			return fmt.Errorf("test list: %w", err)
		}

		if len(cases) == 0 {
			fmt.Println("No test cases registered for this project.")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TEST ID\tNAME\tKIND\tSTACK\tSTATUS")
		for _, tc := range cases {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", tc.ID, tc.Name, tc.Kind, tc.Stack, tc.status())
		}
		w.Flush()
		return nil
	},
}

var showCmd = &cobra.Command{
	Use:   "show <test-id>",
	Short: "Show a registered test case from the control-plane registry",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		testID := args[0]

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// The control plane registers no GET /api/tests/<id> detail route
		// (only PATCH and DELETE), so the test case is selected from the
		// list endpoint.
		cases, err := listTestCases(ctx, c)
		if err != nil {
			return fmt.Errorf("test show: %w", err)
		}
		for _, tc := range cases {
			if tc.ID == testID {
				fmt.Printf("Test Case: %s\n", tc.ID)
				fmt.Printf("Name:      %s\n", tc.Name)
				fmt.Printf("Kind:      %s\n", tc.Kind)
				fmt.Printf("Stack:     %s\n", tc.Stack)
				fmt.Printf("Status:    %s\n", tc.status())
				return nil
			}
		}
		return fmt.Errorf("test show: test case '%s' not found in the control-plane registry", testID)
	},
}

var runCmd = &cobra.Command{
	Use:   "run <test-id>",
	Short: "Queue a control-plane run of a registered test case",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		testID := args[0]

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// POST /api/tests/<test_id>/run executes the single registered test
		// case server-side; there is no stack-wide run route.
		payload := map[string]any{"timeout_seconds": 30}
		var res struct {
			Success bool `json:"success"`
			Result  struct {
				Status   string  `json:"status"`
				Passed   *bool   `json:"passed"`
				Name     string  `json:"name"`
				Severity string  `json:"severity"`
				Stack    string  `json:"stack"`
				RunID    *string `json:"run_id"`
			} `json:"result"`
		}
		if _, err := doAPI(ctx, c, http.MethodPost, fmt.Sprintf("/api/tests/%s/run", testID), payload, &res); err != nil {
			return fmt.Errorf("test run: %w", err)
		}

		verdict := "FAILED"
		if res.Result.Passed != nil && *res.Result.Passed {
			verdict = "PASSED"
		}
		fmt.Printf("Test '%s' (%s): %s\n", testID, res.Result.Name, verdict)
		if res.Result.RunID != nil && *res.Result.RunID != "" {
			fmt.Printf("Server run: %s\n", *res.Result.RunID)
		}
		if verdict == "FAILED" && res.Result.Severity != "" {
			fmt.Printf("Severity: %s\n", res.Result.Severity)
		}
		return nil
	},
}

var idempotencyCmd = &cobra.Command{
	Use:   "idempotency <playbook-path>",
	Short: "Execute dual-pass Ansible run to ensure zero changed tasks on second execution",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("test idempotency is not available: the control-plane endpoint POST /api/test-cases/ansible-idempotency evaluates pre-collected pass results for a server-side stack (stack + pass counts), it does not execute a local playbook; nothing was executed")
	},
}

var scoreCmd = &cobra.Command{
	Use:   "score <stack-id>",
	Short: "Calculate the security & compliance score the control plane computes for a stack",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		stackID := args[0]

		c, err := getClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		var score struct {
			Score       *float64 `json:"score"`
			Grade       string   `json:"grade"`
			TotalTests  int      `json:"total_tests"`
			PassedTests int      `json:"passed_tests"`
			FailedTests int      `json:"failed_tests"`
		}
		if _, err := doAPI(ctx, c, http.MethodGet, fmt.Sprintf("/api/test-cases/score?stack=%s", stackID), nil, &score); err != nil {
			return fmt.Errorf("test score: %w", err)
		}
		if score.Score == nil {
			return fmt.Errorf("test score: the control plane returned no score for stack '%s'", stackID)
		}

		fmt.Printf("Security & compliance scorecard for '%s' (computed by the control plane):\n\n", stackID)
		fmt.Printf("  Score: %.0f / 100 (GRADE: %s)\n", *score.Score, score.Grade)
		fmt.Printf("  Tests: %d passed / %d failed of %d evaluated\n", score.PassedTests, score.FailedTests, score.TotalTests)
		return nil
	},
}

func init() {
	Cmd.AddCommand(listCmd)
	Cmd.AddCommand(showCmd)
	Cmd.AddCommand(runCmd)
	Cmd.AddCommand(idempotencyCmd)
	Cmd.AddCommand(scoreCmd)
}
