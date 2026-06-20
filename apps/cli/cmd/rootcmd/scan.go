package rootcmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/scan"
	"github.com/raizora/radas/v4/internal/utils"
)

var ScanCmd = &cobra.Command{
	Use:   "scan <subcommand>",
	Short: "Security and quality scans (secrets, vuln)",
}

var ScanSecretsCmd = &cobra.Command{
	Use:   "secrets [path]",
	Short: "Scan for committed secrets (gitleaks). Emits SARIF 2.1.0 by default.",
	Long: `Walks the given path (default: .) and reports any secrets
detected. Default output is SARIF 2.1.0 JSON, suitable for piping
into GitHub Code Scanning via 'radas scan secrets > radas.sarif'.
Use --format=table for a human-readable summary.`,
	Run: runScanSecrets,
}

var (
	scanFormat string
	scanStaged bool
	scanAll    bool
	scanConfig string
)

func init() {
	ScanSecretsCmd.Flags().StringVar(&scanFormat, "format", "sarif", "output format: sarif (default) or table")
	ScanSecretsCmd.Flags().BoolVar(&scanStaged, "staged", false, "scan only staged files")
	ScanSecretsCmd.Flags().BoolVar(&scanAll, "all", false, "scan full git history (slow)")
	ScanSecretsCmd.Flags().StringVar(&scanConfig, "config", "", "path to .gitleaks.toml (default: built-in ruleset)")
	ScanCmd.AddCommand(ScanSecretsCmd)
}

func runScanSecrets(cmd *cobra.Command, args []string) {
	dir := "."
	if len(args) > 0 {
		dir = args[0]
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		scanFail("resolve path: %v", err)
	}

	s := scan.NewGitleaksScanner()
	
	spin := utils.NewSpinner("Scanning for secrets (gitleaks)...")
	spin.Start()
	
	findings, scanErr := s.Scan(absDir, scan.ScanOptions{
		Staged: scanStaged,
		All:    scanAll,
		Config: scanConfig,
	})
	
	spin.Stop()

	switch scanFormat {
	case "sarif":
		out := scan.ToSARIF(findings, constants.Version)
		os.Stdout.Write(out)
	case "table":
		fmt.Fprint(os.Stdout, scan.ToTable(findings))
	default:
		scanFail("unknown --format %q (valid: sarif, table)", scanFormat)
	}

	if scanErr != nil {
		scanFail("scan error: %v", scanErr)
	}
	if len(findings) > 0 {
		os.Exit(1)
	}
}

func scanFail(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "scan: "+format+"\n", args...)
	os.Exit(2)
}
