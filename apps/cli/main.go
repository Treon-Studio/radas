package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/cmd/backend"
	"github.com/raizora/radas/v4/cmd/config"
	"github.com/raizora/radas/v4/cmd/cost"
	"github.com/raizora/radas/v4/cmd/design"
	"github.com/raizora/radas/v4/cmd/devops"
	"github.com/raizora/radas/v4/cmd/flags"
	"github.com/raizora/radas/v4/cmd/frontend"
	"github.com/raizora/radas/v4/cmd/git"
	"github.com/raizora/radas/v4/cmd/infra"
	"github.com/raizora/radas/v4/cmd/registry"
	"github.com/raizora/radas/v4/cmd/rootcmd"
	"github.com/raizora/radas/v4/cmd/scan"
	"github.com/raizora/radas/v4/cmd/setup"
	"github.com/raizora/radas/v4/cmd/stack"
	"github.com/raizora/radas/v4/cmd/sync"
	"github.com/raizora/radas/v4/cmd/workspace"
	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/ai"
	"github.com/raizora/radas/v4/internal/tui"
	"github.com/raizora/radas/v4/internal/updater"
)

var (
	projectFlag string
	envFlag     string
)

func main() {
	// Handle aliases if first argument is an alias
	handleAliases()
	
	// Root command
	rootCmd := &cobra.Command{
		Use:   "radas",
		Short: "Radas CLI - Developer Tools",
		Long: constants.RadasASCIIArt + `
Radas CLI provides tools for various development teams.
It includes commands for Frontend (fe), Backend (be), DevOps, and Design teams.
When run with no arguments in a terminal, it launches the TUI dashboard.`,
		Version: constants.Version,
		RunE:    runTUI,
	}

	// Auto-check for updates but only print a message
	go func() {
		release, hasUpdate, err := updater.CheckForUpdate()
		if err == nil && hasUpdate {
			fmt.Printf("\nNew version %s available! Run 'radas update' to upgrade.\n\n", 
				strings.TrimPrefix(release.TagName, "v"))
		}
	}()



	rootCmd.AddCommand(config.ConfigCmd)

	// Add team commands to root
	rootCmd.AddCommand(frontend.Cmd)
	rootCmd.AddCommand(backend.Cmd)
	rootCmd.AddCommand(devops.Cmd)
	rootCmd.AddCommand(design.Cmd)
	rootCmd.AddCommand(infra.Cmd)
	rootCmd.AddCommand(setup.InstallCmd)

	// Add sync-repo command
	rootCmd.AddCommand(sync.SyncRepoCmd)

	// Add update command
	rootCmd.AddCommand(setup.UpdateCmd)

	// Add version command
	rootCmd.AddCommand(setup.VersionCmd)

	// Add aliases command
	rootCmd.AddCommand(rootcmd.AliasesCmd)

	// Add setup command
	rootCmd.AddCommand(setup.SetupCmd)

	rootCmd.AddCommand(config.EnvCmd)
	rootCmd.AddCommand(setup.RebuildCmd)
	rootCmd.AddCommand(setup.ReloadCmd)
	rootCmd.AddCommand(sync.SyncConfigCmd)

	// GIT commands
	rootCmd.AddCommand(git.CommitCmd)
	rootCmd.AddCommand(git.PushCmd)
	rootCmd.AddCommand(git.CreateBranchCmd)
	rootCmd.AddCommand(git.PullCmd)
	rootCmd.AddCommand(git.JustPushCmd)
	rootCmd.AddCommand(git.ListBranchCmd)
	rootCmd.AddCommand(git.DelBranchCmd)
	rootCmd.AddCommand(git.CloneCmd)
	rootCmd.AddCommand(rootcmd.GotoCmd)


	rootCmd.AddCommand(rootcmd.DoctorCmd)
	rootCmd.AddCommand(scan.ScanCmd)

	// Workspace command group (Phase A: Monorepo Manager)
	rootCmd.AddCommand(workspace.Cmd)

	// Cloud, Infrastructure, BYOC & FinOps command groups (Console Parity)
	rootCmd.AddCommand(stack.Cmd)
	rootCmd.AddCommand(flags.Cmd)
	rootCmd.AddCommand(registry.Cmd)
	rootCmd.AddCommand(cost.Cmd)

	// Execute
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

// handleAliases checks if the first argument is an alias and replaces it with the full command
func handleAliases() {
	// Need at least one argument (the alias)
	if len(os.Args) < 2 {
		return
	}
	
	// Check if the first argument is an alias
	alias := os.Args[1]
	if fullCommand, exists := constants.CommandAliases[alias]; exists {
		// Split the full command into parts
		cmdParts := strings.Split(fullCommand, " ")
		
		// Create a new args slice with "radas" as the program name,
		// followed by the expanded command parts,
		// followed by any additional args provided by the user
		newArgs := make([]string, 0, len(cmdParts) + len(os.Args) - 1)
		newArgs = append(newArgs, os.Args[0]) // Program name (radas)
		newArgs = append(newArgs, cmdParts...) // Expanded command
		
		// Add any additional arguments that were provided (if any)
		if len(os.Args) > 2 {
			newArgs = append(newArgs, os.Args[2:]...)
		}
		
		// Replace os.Args with the new arguments
		os.Args = newArgs
		
		// Print a message to show the alias expansion (optional)
		fmt.Printf("Using alias: %s → radas %s\n\n", alias, fullCommand)
	}
}

func isTerminal(fd uintptr) bool {
	stat, _ := os.Stdout.Stat()
	return (stat.Mode() & os.ModeCharDevice) != 0
}

func runTUI(cmd *cobra.Command, args []string) error {
	if len(args) > 0 {
		return nil
	}
	if !isTerminal(os.Stdout.Fd()) {
		return cmd.Help()
	}

	aiConfig, err := ai.LoadAIConfigFromRadasYML()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to load AI config: %v\n", err)
		aiConfig = nil
	}

	return tui.Start(nil, nil, aiConfig)
}
