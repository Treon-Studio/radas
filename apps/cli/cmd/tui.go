package cmd

import (
	"fmt"
	"os"

	"github.com/raizora/radas/v4/internal/ai"
	"github.com/raizora/radas/v4/internal/tui"
	"github.com/spf13/cobra"
)

func isTerminal(fd uintptr) bool {
	stat, _ := os.Stdout.Stat()
	return (stat.Mode() & os.ModeCharDevice) != 0
}

func runTUI(cmd *cobra.Command, args []string) error {
	if len(args) > 0 {
		return cmd.Help()
	}
	if !isTerminal(os.Stdout.Fd()) {
		return cmd.Help()
	}

	aiConfig, err := ai.LoadAIConfigFromRadasYML()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to load AI config: %v\n", err)
		aiConfig = nil
	}

	projects := []string{}
	templates := []string{}

	return tui.Start(projects, templates, aiConfig)
}
