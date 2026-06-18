package rootcmd

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/jedib0t/go-pretty/v6/text"
	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/env"
	"github.com/raizora/radas/v4/internal/utils"
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

		utils.PrettyPrintTable(headers, headerColors, rows, utils.EnvRole)

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

func init() {
	EnvGetCmd.Flags().StringP("environment", "e", "", "Environment name (staging, production, etc.)")
	EnvGetCmd.Flags().Bool("origin", false, "Show detailed origin for each variable")
	EnvSetCmd.Flags().StringP("environment", "e", "", "Environment name (staging, production, etc.)")
	EnvCmd.AddCommand(EnvGetCmd)
	EnvCmd.AddCommand(EnvSetCmd)
}
