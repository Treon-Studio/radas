package frontend

import (
	"fmt"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/scan"
	"github.com/raizora/radas/v4/internal/utils"
)

var VulnCmd = &cobra.Command{
	Use:   "vuln",
	Short: "Scan frontend dependencies for vulnerabilities",
	Long:  `Runs pnpm audit (or npm audit) on the current frontend project to detect known vulnerabilities in dependencies.`,
	Run: func(cmd *cobra.Command, args []string) {
		results := []*scan.VulnResult{}

		// Try pnpm first
		r := scan.RunPnpmAudit(".")
		results = append(results, r)

		// Fallback to npm if pnpm wasn't relevant
		if strings.Contains(r.Summary, "skipped") {
			r2 := scan.RunNpmAudit(".")
			if !strings.Contains(r2.Summary, "skipped") {
				results = append(results, r2)
			}
		}

		rows := make([][]string, 0, len(results))
		failed := false
		for _, r := range results {
			passStr := color.New(color.FgGreen).Sprint("✓")
			if !r.Pass {
				passStr = color.New(color.FgRed).Sprint("✘")
				failed = true
			}
			rows = append(rows, []string{r.Tool, passStr, r.Summary})
		}
		utils.PrintTableTo(os.Stdout, []string{"Tool", "Status", "Summary"}, rows)

		for _, r := range results {
			if r.Output != "" && !r.Pass {
				fmt.Fprintln(os.Stdout)
				os.Stdout.Write([]byte(r.Output))
				os.Stdout.Write([]byte{'\n'})
			}
		}
		if failed {
			os.Exit(1)
		}
	},
}
