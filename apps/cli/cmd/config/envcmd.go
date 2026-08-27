package config

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/jedib0t/go-pretty/v6/text"
	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/env"
	"github.com/raizora/radas/v4/internal/utils"
	"github.com/spf13/cobra"
)

var EnvCmd = &cobra.Command{
	Use:   "env",
	Short: "Manage and display environments",
}

var EnvGetCmd = &cobra.Command{
	Use:   "get",
	Short: "Print environment variables for a given environment as a table",
	Run: func(cmd *cobra.Command, args []string) {
		envName, _ := cmd.Flags().GetString("environment")
		if envName == "" {
			envName, _ = cmd.Flags().GetString("e")
		}
		if envName == "" {
			fmt.Println("Please specify an environment with -e or --environment (e.g. staging, production)")
			os.Exit(1)
		}

		withOrigin, _ := cmd.Flags().GetBool("origin")

		dir, err := os.Getwd()
		if err != nil {
			fmt.Println("Failed to get current directory:", err)
			os.Exit(1)
		}

		// Load credentials: global config > project radas.yml
		var cfCfg config.CloudflareConfig
		if globalCfg, _ := config.LoadGlobalConfig(); globalCfg != nil {
			cfCfg = globalCfg.Cloudflare
		}
		if projCfg, _ := config.FindConfig(); projCfg != "" {
			if cfg, _ := config.ParseConfig(projCfg); cfg != nil {
				if cfg.Cloudflare.APIToken != "" {
					cfCfg.APIToken = cfg.Cloudflare.APIToken
				}
				if cfg.Cloudflare.AccountID != "" {
					cfCfg.AccountID = cfg.Cloudflare.AccountID
				}
			}
		}

		result := env.CollectEnv(dir, envName, withOrigin, cfCfg)

		if len(result.Vars) == 0 {
			fmt.Println("No environment variables found.")
			if !result.HasCloudflare {
				fmt.Println("Tip: Create a .env file or wrangler.toml in your project root.")
			}
			return
		}

		// Build table rows
		headers := []string{"VARIABLE", "VALUE", "SOURCE"}
		headerColors := []text.Colors{
			{text.FgHiCyan, text.Bold},
			{text.FgHiYellow, text.Bold},
			{text.FgHiMagenta, text.Bold},
		}
		if withOrigin {
			headers = append(headers, "ORIGIN")
		}

		var rows [][]string
		for _, v := range result.Vars {
			row := []string{v.Key, v.Value, string(v.Source)}
			if withOrigin {
				row = append(row, v.Origin)
			}
			rows = append(rows, row)
		}

		utils.PrettyPrintEnvTable(headers, headerColors, rows)

		if result.RemoteError != "" {
			fmt.Printf("\n⚠️  Remote fetch failed: %s\n", result.RemoteError)
		}
	},
}

var EnvSetCmd = &cobra.Command{
	Use:   "set",
	Short: "Open the .env file for a given environment in the default code editor",
	Run: func(cmd *cobra.Command, args []string) {
		envName, _ := cmd.Flags().GetString("environment")
		if envName == "" {
			envName, _ = cmd.Flags().GetString("e")
		}
		if envName == "" {
			fmt.Println("Please specify an environment with -e or --environment (e.g. staging, production)")
			os.Exit(1)
		}
		filePath := fmt.Sprintf("envs/.env.%s", envName)
		if _, err := os.Stat(filePath); err != nil {
			fmt.Printf("Creating new env file: %s\n", filePath)
			os.MkdirAll("envs", 0755)
			mockContent := "# Environment file\n# Replace these values with your actual configuration\nAPI_URL=https://example.com\nDB_HOST=localhost\nDB_PORT=5432\n"
			os.WriteFile(filePath, []byte(mockContent), 0644)
		}
		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = constants.DefaultEditor // fallback to VSCode
		}
		cmdExec := exec.Command(editor, filePath)
		cmdExec.Stdout = os.Stdout
		cmdExec.Stderr = os.Stderr
		cmdExec.Stdin = os.Stdin
		if err := cmdExec.Run(); err != nil {
			fmt.Printf("Failed to open %s with %s: %v\n", filePath, editor, err)
			os.Exit(1)
		}
	},
}

var EnvListCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List the environments defined in this workspace (envs/ directory)",
	Run: func(cmd *cobra.Command, args []string) {
		entries, err := os.ReadDir("envs")
		if err != nil {
			fmt.Println("No envs/ directory in this workspace (create envs/.env.<name> files or run config env set).")
			return
		}
		found := []string{}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if strings.HasPrefix(name, ".env.") {
				name = strings.TrimPrefix(name, ".env.")
				if name == "example" {
					continue
				}
			} else if !strings.HasSuffix(name, ".env") {
				continue
			}
			found = append(found, name)
		}
		if len(found) == 0 {
			fmt.Println("No environment files found in envs/ (expected envs/.env.<name> files).")
			return
		}
		for _, name := range found {
			fmt.Println(name)
		}
	},
}

var EnvCheckCmd = &cobra.Command{
	Use:     "check [env-name]",
	Aliases: []string{"status", "diag"},
	Short:   "Run real local diagnostics: workspace config, env files, and control-plane reachability",
	RunE: func(cmd *cobra.Command, args []string) error {
		envName := "default"
		if len(args) > 0 {
			envName = args[0]
		}
		fmt.Printf("Running diagnostics for environment '%s' (local facts only — the CLI does not fabricate server-side health):\n\n", envName)

		fails := 0

		// Workspace config.
		if cfgPath, err := config.FindConfig(); err == nil {
			fmt.Printf("✔ radas.yml: found (%s)\n", cfgPath)
		} else {
			fails++
			fmt.Println("✗ radas.yml: not found in this workspace")
		}

		// Env file.
		envFile := fmt.Sprintf("envs/.env.%s", envName)
		switch _, statErr := os.Stat(envFile); {
		case statErr == nil:
			fmt.Printf("✔ Env file: found (%s)\n", envFile)
		case os.IsNotExist(statErr):
			fails++
			fmt.Printf("✗ Env file: %s does not exist (run 'config env set %s' to create it)\n", envFile, envName)
		default:
			fails++
			fmt.Printf("✗ Env file: cannot stat %s: %v\n", envFile, statErr)
		}

		// Control-plane reachability — a real probe, reported honestly.
		apiURL := os.Getenv("RADAS_API_URL")
		if apiURL == "" {
			apiURL = "http://localhost:5001"
		}
		client := &http.Client{Timeout: 3 * time.Second}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, apiURL+"/api/health", nil)
		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("✗ RADAS Server (%s): unreachable (%v)\n", apiURL, err)
			fmt.Println("  (Start the local stack with: 'pnpm dev:radas'; server-side diagnostics are not available in standalone mode)")
			fails++
		} else {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				fmt.Printf("✔ RADAS Server (%s): ONLINE (GET /api/health returned 200)\n", apiURL)
			} else {
				fails++
				fmt.Printf("✗ RADAS Server (%s): GET /api/health returned status %d\n", apiURL, resp.StatusCode)
			}
		}

		fmt.Println()
		if fails > 0 {
			return fmt.Errorf("environment '%s': %d check(s) failed (all reported facts come from real probes)", envName, fails)
		}
		fmt.Printf("Environment '%s': all local checks passed.\n", envName)
		return nil
	},
}

func init() {
	EnvGetCmd.Flags().StringP("environment", "e", "", "Environment name (staging, production, etc.)")
	EnvGetCmd.Flags().Bool("origin", false, "Show detailed origin for each variable")
	EnvSetCmd.Flags().StringP("environment", "e", "", "Environment name (staging, production, etc.)")
	EnvCmd.AddCommand(EnvGetCmd)
	EnvCmd.AddCommand(EnvSetCmd)
	EnvCmd.AddCommand(EnvListCmd)
	EnvCmd.AddCommand(EnvCheckCmd)
}
