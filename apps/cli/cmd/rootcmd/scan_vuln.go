package rootcmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/scan"
	"github.com/raizora/radas/v4/internal/utils"
)

var scanVulnFormat string

var ScanVulnCmd = &cobra.Command{
	Use:   "vuln [path]",
	Short: "Scan for dependency vulnerabilities (govulncheck + pnpm/npm audit)",
	Long: `Runs vulnerability scanners on the project at the given path (default: .).

Detects which scanners to use based on project files:
  - go.mod       → govulncheck
  - pnpm-lock    → pnpm audit
  - package-lock → npm audit

Output formats: table (default) or json.`,
	Run: runScanVuln,
}

func init() {
	ScanVulnCmd.Flags().StringVar(&scanVulnFormat, "format", "table", "output format: table (default) or json")
	ScanCmd.AddCommand(ScanVulnCmd)
}

func runScanVuln(cmd *cobra.Command, args []string) {
	dir := "."
	if len(args) > 0 {
		dir = args[0]
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		vulnFail("resolve path: %v", err)
	}

	var results []*scan.VulnResult

	// Go vulnerabilities
	r := scan.RunGovulncheck(absDir)
	results = append(results, r)

	// JS/TS vulnerabilities
	r2 := scan.RunPnpmAudit(absDir)
	results = append(results, r2)

	// Fallback: if pnpm wasn't used, try npm
	if strings.Contains(r2.Summary, "skipped") {
		r3 := scan.RunNpmAudit(absDir)
		if !strings.Contains(r3.Summary, "skipped") {
			results = append(results, r3)
		}
	}

	switch scanVulnFormat {
	case "json":
		out, _ := json.MarshalIndent(results, "", "  ")
		os.Stdout.Write(out)
		os.Stdout.Write([]byte{'\n'})
	case "table":
		printVulnTable(results)
	default:
		vulnFail("unknown --format %q (valid: table, json)", scanVulnFormat)
	}

	// Exit 1 if any scan found issues
	failed := false
	for _, r := range results {
		if !r.Pass {
			failed = true
		}
	}
	if failed {
		os.Exit(1)
	}
}

func printVulnTable(results []*scan.VulnResult) {
	rows := make([][]string, 0, len(results))
	for _, r := range results {
		status := colorStatus(r.Pass)
		rows = append(rows, []string{r.Tool, status, r.Summary})
	}
	fmt.Fprintln(os.Stdout, "Vulnerability Scan Results")
	fmt.Fprintln(os.Stdout, "==========================")
	utils.PrintTableTo(os.Stdout, []string{"Tool", "Status", "Summary"}, rows)

	for _, r := range results {
		if r.Output != "" && !r.Pass {
			fmt.Fprintf(os.Stdout, "\n--- %s output ---\n", r.Tool)
			os.Stdout.Write([]byte(r.Output))
			os.Stdout.Write([]byte{'\n'})
		}
	}
}

func colorStatus(pass bool) string {
	if pass {
		return color.New(color.FgGreen).Sprint("✓")
	}
	return color.New(color.FgRed).Sprint("✘")
}

func vulnFail(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "scan vuln: "+format+"\n", args...)
	os.Exit(2)
}
