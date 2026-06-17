package cmd

import (
	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/cmd/backend"
	"github.com/raizora/radas/v4/cmd/design"
	"github.com/raizora/radas/v4/cmd/devops"
	"github.com/raizora/radas/v4/cmd/frontend"
	"github.com/raizora/radas/v4/cmd/infra"
	"github.com/raizora/radas/v4/cmd/rootcmd"
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
	// Register clone command
	rootCmd.AddCommand(rootcmd.CloneCmd)
	rootCmd.AddCommand(rootcmd.GotoCmd)
	rootCmd.AddCommand(rootcmd.DoctorCmd)

	// Register all team commands
	rootCmd.AddCommand(frontend.Cmd)
	rootCmd.AddCommand(backend.Cmd)
	rootCmd.AddCommand(devops.Cmd)
	rootCmd.AddCommand(design.Cmd)
	rootCmd.AddCommand(infra.Cmd)
	rootCmd.AddCommand(rootcmd.InstallCmd)
	rootCmd.AddCommand(rootcmd.ConfigCmd)
	rootCmd.AddCommand(rootcmd.SyncRepoCmd)
	rootCmd.AddCommand(rootcmd.EnvCmd)
	rootCmd.AddCommand(rootcmd.UpdateCmd)
	rootCmd.AddCommand(rootcmd.RebuildCmd)
	rootCmd.AddCommand(rootcmd.PullCmd)
	rootCmd.AddCommand(rootcmd.ScanCmd)
}