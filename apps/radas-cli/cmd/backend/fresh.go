package backend

import (
	"fmt"
	"os"
	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

// FreshCmd is the command to clean and reinstall backend dependencies (like FE fresh)
var cleanCache bool

var FreshCmd = &cobra.Command{
	Use:   "fresh",
	Short: "Clean and reinstall backend dependencies based on detected stack (Golang, Elixir, PHP, Laravel)",
	Run: func(cmd *cobra.Command, args []string) {
		stack, dir := detectBackendStack()
		if stack == "" {
			fmt.Println("Could not detect backend stack in current or parent directories (up to 10 levels). Supported: Golang, Elixir, PHP, Laravel.")
			os.Exit(1)
		}
		fmt.Printf("Detected backend stack: %s (at %s)\n", stack, dir)
		if !cmd.Flags().Changed("clean-cache") {
			prompt := &survey.Confirm{
				Message: "Do you want to also clean build/cache (if supported by stack)?",
				Default: true,
			}
			_ = survey.AskOne(prompt, &cleanCache)
		}
		if err := runCleanForStack(stack, dir, cleanCache); err != nil {
			fmt.Printf("Clean failed: %v\n", err)
			os.Exit(1)
		}
		if err := runInstallForStack(stack, dir); err != nil {
			fmt.Printf("Install failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Fresh completed successfully!")
	},
}

func init() {
	FreshCmd.Flags().BoolVar(&cleanCache, "clean-cache", true, "Also clean build/cache if supported by stack (default true)")
}

