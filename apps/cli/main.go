package main

import (
	"fmt"
	"os"
    "strings"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/cmd/backend"
	"github.com/raizora/radas/v4/cmd/design"
	"github.com/raizora/radas/v4/cmd/devops"
	"github.com/raizora/radas/v4/cmd/frontend"
	"github.com/raizora/radas/v4/cmd/infra"
	"github.com/raizora/radas/v4/cmd/rootcmd"
	"github.com/raizora/radas/v4/constants"
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
It includes commands for Frontend (fe), Backend (be), DevOps, and Design teams.`,
		Version: constants.Version,
	}

	// Auto-check for updates but only print a message
	go func() {
		release, hasUpdate, err := updater.CheckForUpdate()
		if err == nil && hasUpdate {
			fmt.Printf("\nNew version %s available! Run 'radas update' to upgrade.\n\n", 
				strings.TrimPrefix(release.TagName, "v"))
		}
	}()



	rootCmd.AddCommand(rootcmd.ConfigCmd)

	// Add team commands to root
	rootCmd.AddCommand(frontend.Cmd)
	rootCmd.AddCommand(backend.Cmd)
	rootCmd.AddCommand(devops.Cmd)
	rootCmd.AddCommand(design.Cmd)
	rootCmd.AddCommand(infra.Cmd)
	rootCmd.AddCommand(rootcmd.InstallCmd)

	// Add sync-repo command
	rootCmd.AddCommand(rootcmd.SyncRepoCmd)

	// Add update command
	rootCmd.AddCommand(rootcmd.UpdateCmd)

	// Add version command
	rootCmd.AddCommand(rootcmd.VersionCmd)
	
	// Add aliases command
	rootCmd.AddCommand(rootcmd.AliasesCmd)

	// Add setup command
	rootCmd.AddCommand(rootcmd.SetupCmd)

	rootCmd.AddCommand(rootcmd.EnvCmd)
	rootCmd.AddCommand(rootcmd.RebuildCmd)
	rootCmd.AddCommand(rootcmd.ReloadCmd)
	rootCmd.AddCommand(rootcmd.SyncConfigCmd)

	// GIT commands
	rootCmd.AddCommand(rootcmd.CommitCmd)
	rootCmd.AddCommand(rootcmd.PushCmd)
	rootCmd.AddCommand(rootcmd.CreateBranchCmd)
	rootCmd.AddCommand(rootcmd.PullCmd)
	rootCmd.AddCommand(rootcmd.JustPushCmd)
	rootCmd.AddCommand(rootcmd.ListBranchCmd)
	rootCmd.AddCommand(rootcmd.DelBranchCmd)
	rootCmd.AddCommand(rootcmd.CloneCmd)
	rootCmd.AddCommand(rootcmd.GotoCmd)

	
	rootCmd.AddCommand(rootcmd.DoctorCmd)
	rootCmd.AddCommand(rootcmd.ScanCmd)

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
