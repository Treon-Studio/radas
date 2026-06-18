package backend

import (
	"fmt"
	"os"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/scan"
	"github.com/raizora/radas/v4/internal/utils"
)

var VulnCmd = &cobra.Command{
	Use:   "vuln",
	Short: "Scan Go dependencies for vulnerabilities",
	Long:  `Runs govulncheck on the current Go project to detect known vulnerabilities in dependencies.`,
	Run: func(cmd *cobra.Command, args []string) {
		r := scan.RunGovulncheck(".")
		passStr := color.New(color.FgGreen).Sprint("✓")
		if !r.Pass {
			passStr = color.New(color.FgRed).Sprint("✘")
		}
		utils.PrintTableTo(os.Stdout, []string{"Tool", "Status", "Summary"},
			[][]string{{"govulncheck", passStr, r.Summary}})

		if r.Output != "" && !r.Pass {
			fmt.Fprintln(os.Stdout)
			os.Stdout.Write([]byte(r.Output))
			os.Stdout.Write([]byte{'\n'})
		}
		if !r.Pass {
			os.Exit(1)
		}
	},
}
