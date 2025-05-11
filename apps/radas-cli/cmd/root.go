package cmd

import (
	"github.com/spf13/cobra"
	"radas/cmd/backend"
	"radas/cmd/design"
	"radas/cmd/devops"
	"radas/cmd/frontend"
	"radas/cmd/rootcmd"
)

var rootCmd = &cobra.Command{
	Use:   "radas",
	Short: "RADAS CLI - tool to simplify daily developer activities",
	Long: `RADAS CLI is a command line interface that helps developers from various teams
(Frontend, Backend, DevOps, Design) to handle their daily activities with ease.`,
}

// Execute runs the root command
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	// Register all team commands
	rootCmd.AddCommand(frontend.Cmd)
	rootCmd.AddCommand(backend.Cmd)
	rootCmd.AddCommand(devops.Cmd)
	rootCmd.AddCommand(design.Cmd)
	rootCmd.AddCommand(rootcmd.InstallCmd)
	rootCmd.AddCommand(rootcmd.ConfigCmd)
	rootCmd.AddCommand(rootcmd.SyncRepoCmd)
	rootCmd.AddCommand(rootcmd.EnvCmd)
	rootCmd.AddCommand(rootcmd.UpdateCmd)
	rootCmd.AddCommand(rootcmd.RebuildCmd)
	rootCmd.AddCommand(rootcmd.PullCmd)
}