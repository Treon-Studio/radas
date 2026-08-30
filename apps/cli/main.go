package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/cmd/approval"
	"github.com/raizora/radas/v4/cmd/audit"
	"github.com/raizora/radas/v4/cmd/auth"
	"github.com/raizora/radas/v4/cmd/backend"
	"github.com/raizora/radas/v4/cmd/cloud"
	"github.com/raizora/radas/v4/cmd/config"
	"github.com/raizora/radas/v4/cmd/cost"
	"github.com/raizora/radas/v4/cmd/design"
	"github.com/raizora/radas/v4/cmd/devops"
	"github.com/raizora/radas/v4/cmd/drift"
	"github.com/raizora/radas/v4/cmd/flags"
	"github.com/raizora/radas/v4/cmd/frontend"
	"github.com/raizora/radas/v4/cmd/git"
	"github.com/raizora/radas/v4/cmd/infra"
	"github.com/raizora/radas/v4/cmd/org"
	"github.com/raizora/radas/v4/cmd/policy"
	"github.com/raizora/radas/v4/cmd/project"
	"github.com/raizora/radas/v4/cmd/registry"
	"github.com/raizora/radas/v4/cmd/rootcmd"
	"github.com/raizora/radas/v4/cmd/scan"
	"github.com/raizora/radas/v4/cmd/secret"
	"github.com/raizora/radas/v4/cmd/setup"
	"github.com/raizora/radas/v4/cmd/stack"
	"github.com/raizora/radas/v4/cmd/state"
	"github.com/raizora/radas/v4/cmd/sync"
	"github.com/raizora/radas/v4/cmd/system"
	"github.com/raizora/radas/v4/cmd/testcmd"
	"github.com/raizora/radas/v4/cmd/user"
	"github.com/raizora/radas/v4/cmd/worker"
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
		Version:       constants.Version,
		RunE:          runTUI,
		SilenceErrors: true,
		SilenceUsage:  true,
	}

	// Auto-check for updates only on interactive root launch to avoid interfering with subcommands
	if len(os.Args) <= 1 {
		go func() {
			release, hasUpdate, err := updater.CheckForUpdate()
			if err == nil && hasUpdate {
				fmt.Printf("\nNew version %s available! Run 'radas update' to upgrade.\n\n",
					strings.TrimPrefix(release.TagName, "v"))
			}
		}()
	}

	// Shared connection/tenant flags (--api-url, --token, --org-id,
	// --project-id) resolved by internal/config.LoadRuntimeConfig.
	rootcmd.RegisterRuntimeFlags(rootCmd)

	rootCmd.AddCommand(config.ConfigCmd)

	// Auth command group (login/refresh/status/logout, Task 3.1)
	rootCmd.AddCommand(auth.Cmd)

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

	// GIT command group (root-level names remain as deprecated aliases)
	rootCmd.AddCommand(git.GitCmd)
	rootCmd.AddCommand(git.DeprecatedAlias(git.CommitCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.PushCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.CreateBranchCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.PullCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.JustPushCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.ListBranchCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.DelBranchCmd))
	rootCmd.AddCommand(git.DeprecatedAlias(git.CloneCmd))
	rootCmd.AddCommand(rootcmd.GotoCmd)
	rootCmd.AddCommand(rootcmd.OpenCmd)

	rootCmd.AddCommand(rootcmd.DoctorCmd)
	rootCmd.AddCommand(scan.ScanCmd)

	// Workspace command group (Phase A: Monorepo Manager)
	rootCmd.AddCommand(workspace.Cmd)

	// Cloud, Infrastructure, BYOC & FinOps command groups (Console Parity)
	rootCmd.AddCommand(stack.Cmd)
	rootCmd.AddCommand(flags.Cmd)
	rootCmd.AddCommand(registry.Cmd)
	rootCmd.AddCommand(cost.Cmd)
	rootCmd.AddCommand(approval.Cmd)
	rootCmd.AddCommand(audit.Cmd)
	rootCmd.AddCommand(policy.Cmd)
	rootCmd.AddCommand(cloud.Cmd)
	rootCmd.AddCommand(worker.Cmd)
	rootCmd.AddCommand(org.Cmd)
	rootCmd.AddCommand(user.Cmd)
	rootCmd.AddCommand(project.Cmd)
	rootCmd.AddCommand(secret.Cmd)
	rootCmd.AddCommand(drift.Cmd)
	rootCmd.AddCommand(state.Cmd)
	rootCmd.AddCommand(testcmd.Cmd)
	rootCmd.AddCommand(system.Cmd)

	// Execute
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
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
		newArgs := make([]string, 0, len(cmdParts)+len(os.Args)-1)
		newArgs = append(newArgs, os.Args[0])  // Program name (radas)
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
