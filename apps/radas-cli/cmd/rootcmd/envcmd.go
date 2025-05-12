package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/jedib0t/go-pretty/v6/text"
	"github.com/spf13/cobra"
	"radas/internal/utils"
) // go-pretty for beautiful tables

var envList = []string{"staging", "canary", "production"}

var EnvCmd = &cobra.Command{
	Use:   "env",
	Short: "Manage and display environments",
}

var EnvGetCmd = &cobra.Command{
	Use:   "get",
	Short: "Print environment variables for a given environment as a table",
	Run: func(cmd *cobra.Command, args []string) {
		env, _ := cmd.Flags().GetString("environment")
		if env == "" {
			env, _ = cmd.Flags().GetString("e")
		}
		if env == "" {
			fmt.Println("Please specify an environment with -e or --environment (staging, canary, production)")
			os.Exit(1)
		}
		found := false
		for _, v := range envList {
			if v == env {
				found = true
				break
			}
		}
		if !found {
			fmt.Printf("Environment '%s' not found. Available: staging, canary, production\n", env)
			os.Exit(1)
		}
		// Example: load env file (envs/.env.{env})
		filePath := fmt.Sprintf("envs/.env.%s", env)
		data, err := os.ReadFile(filePath)
		if err != nil {
			fmt.Printf("[MOCK] File %s not found. Showing mock data for '%s':\n", filePath, env)
			mockRows := [][]string{
				{"API_URL", "https://api.mock.com"},
				{"DB_HOST", "mock-db"},
				{"SECRET_KEY", "mock-secret"},
			}
			headers := []string{"KEY", "VALUE", "ROLE"}
			headerColors := []text.Colors{
				{text.FgHiCyan, text.Bold},
				{text.FgHiYellow, text.Bold},
				{text.FgHiMagenta, text.Bold},
			}
			utils.PrettyPrintTable(headers, headerColors, mockRows, utils.EnvRole)
			return
		}
		lines := strings.Split(string(data), "\n")
		var rows [][]string
		for _, line := range lines {
			if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				rows = append(rows, []string{parts[0], parts[1]})
			}
		}
		headers := []string{"KEY", "VALUE", "ROLE"}
		headerColors := []text.Colors{
			{text.FgHiCyan, text.Bold},
			{text.FgHiYellow, text.Bold},
			{text.FgHiMagenta, text.Bold},
		}
		utils.PrettyPrintTable(headers, headerColors, rows, utils.EnvRole)
	},
}

var EnvSetCmd = &cobra.Command{
	Use:   "set",
	Short: "Open the .env file for a given environment in the default code editor",
	Run: func(cmd *cobra.Command, args []string) {
		env, _ := cmd.Flags().GetString("environment")
		if env == "" {
			env, _ = cmd.Flags().GetString("e")
		}
		if env == "" {
			fmt.Println("Please specify an environment with -e or --environment (staging, canary, production)")
			os.Exit(1)
		}
		found := false
		for _, v := range envList {
			if v == env {
				found = true
				break
			}
		}
		if !found {
			fmt.Printf("Environment '%s' not found. Available: staging, canary, production\n", env)
			os.Exit(1)
		}
		filePath := fmt.Sprintf("envs/.env.%s", env)
		if _, err := os.Stat(filePath); err != nil {
			fmt.Printf("[MOCK] File %s does not exist. Creating mock file for '%s'...\n", filePath, env)
			os.MkdirAll("envs", 0755)
			mockContent := "API_URL=https://api.mock.com\nDB_HOST=mock-db\nSECRET_KEY=mock-secret\n"
			os.WriteFile(filePath, []byte(mockContent), 0644)
		}
		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "code" // fallback to VSCode
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
	EnvGetCmd.Flags().StringP("environment", "e", "", "Environment name (staging, canary, production)")
	EnvSetCmd.Flags().StringP("environment", "e", "", "Environment name (staging, canary, production)")
	EnvCmd.AddCommand(EnvGetCmd)
	EnvCmd.AddCommand(EnvSetCmd)
}
