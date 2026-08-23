// Package system implements the `radas system` (and `radas mole`) command group for macOS
// system optimization, developer cache cleaning, disk analysis, and deep uninstallation.
package system

import (
	"fmt"
	"os"
	"path/filepath"
	"text/tabwriter"

	"github.com/spf13/cobra"
	internalsys "github.com/raizora/radas/v4/internal/system"
)

// Cmd is the parent command for the system cleaner and optimizer group.
var Cmd = &cobra.Command{
	Use:     "system",
	Aliases: []string{"sys", "mole", "optimizer"},
	Short:   "Clean developer caches, analyze disk space, optimize macOS performance, and deep uninstall apps",
	Long: `The system command group (inspired by Mole) provides high-performance utilities
for cleaning developer caches (Xcode, Node/pnpm, Go, Rust, Pip, Docker, Homebrew),
analyzing heavy directories, diagnosing system hardware/thermals, and optimizing macOS.`,
}

var cleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Clean developer caches, application logs, and temporary files",
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return err
		}

		targets := internalsys.GetCleanTargets(homeDir)
		report := internalsys.RunCleanup(targets, dryRun)

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "TARGET CATEGORY\tCACHE TYPE\tITEMS\tRECOVERABLE")
		for _, t := range report.Targets {
			if t.SizeBytes > 0 || !dryRun {
				fmt.Fprintf(w, "%s\t%s\t%d\t%s\n", t.Category, t.Name, t.ItemCount, internalsys.FormatBytes(t.SizeBytes))
			}
		}
		w.Flush()

		modeStr := "CLEANED"
		if dryRun {
			modeStr = "IDENTIFIED (Dry-Run)"
		}

		fmt.Println("\n------------------------------------------------------------")
		fmt.Printf("✔ Total Space %s: %s (%d files in %v)\n", modeStr, internalsys.FormatBytes(report.TotalCleanedBytes), report.TotalItemsRemoved, report.Duration)
		if dryRun {
			fmt.Println("Run without '--dry-run' to safely purge these caches.")
		}
		return nil
	},
}

var purgeCmd = &cobra.Command{
	Use:   "purge",
	Short: "Deep purge heavy build caches across Docker, Xcode, pnpm, Go, and Cargo",
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		fmt.Println("Initiating deep developer cache purge...")

		homeDir, _ := os.UserHomeDir()
		targets := internalsys.GetCleanTargets(homeDir)
		report := internalsys.RunCleanup(targets, dryRun)

		// Also run Docker prune
		dockerMsg, _ := internalsys.DockerPrune(dryRun)

		fmt.Printf("✔ Cleaned %s from developer toolchain caches.\n", internalsys.FormatBytes(report.TotalCleanedBytes))
		if dockerMsg != "" {
			fmt.Printf("✔ Docker: %s\n", dockerMsg)
		}
		return nil
	},
}

var analyzeCmd = &cobra.Command{
	Use:     "analyze [directory]",
	Aliases: []string{"disk", "heavy"},
	Short:   "Scan and display large directories and disk space consumers",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir := "."
		if len(args) > 0 {
			dir = args[0]
		}
		minMB, _ := cmd.Flags().GetInt64("min-size")
		minBytes := minMB * 1024 * 1024

		absDir, _ := filepath.Abs(dir)
		fmt.Printf("Scanning disk usage in '%s' (threshold: > %d MB)...\n\n", absDir, minMB)

		items, err := internalsys.AnalyzeDisk(absDir, minBytes, 2)
		if err != nil {
			return err
		}

		if len(items) == 0 {
			fmt.Printf("No items larger than %d MB found.\n", minMB)
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "SIZE\tTYPE\tFILES\tPATH")
		for _, it := range items {
			typeStr := "FILE"
			if it.IsDir {
				typeStr = "DIR"
			}
			fmt.Fprintf(w, "%s\t%s\t%d\t%s\n", it.HumanSize, typeStr, it.ItemCount, it.Path)
		}
		w.Flush()
		return nil
	},
}

var statusCmd = &cobra.Command{
	Use:     "status",
	Aliases: []string{"info", "health"},
	Short:   "Display macOS hardware status, CPU, RAM pressure, thermals, and battery",
	RunE: func(cmd *cobra.Command, args []string) error {
		health := internalsys.GetSystemHealth()

		fmt.Println("============================================================")
		fmt.Println("              RADAS SYSTEM & HARDWARE STATUS               ")
		fmt.Println("============================================================")
		fmt.Printf("  OS / Architecture:  %s / %s\n", health.OSVersion, health.Arch)
		fmt.Printf("  CPU Cores / Load:   %d Cores (Load: %.1f%%)\n", health.CPUCores, health.CPUUsagePct)
		fmt.Printf("  Memory (RAM):       %s Total (Active: %.1f%%)\n", internalsys.FormatBytes(health.TotalRAMBytes), health.RAMUsagePct)
		fmt.Printf("  Disk Space (/):     %.1f GB Free / %.1f GB Total (Used: %.1f%%)\n", health.DiskFreeGB, health.DiskTotalGB, health.DiskUsagePct)
		fmt.Printf("  Thermal State:      %s\n", health.ThermalState)
		if health.BatteryPct > 0 {
			fmt.Printf("  Battery Status:     %d%% (%s)\n", health.BatteryPct, health.BatteryHealth)
		}
		fmt.Println("============================================================")
		return nil
	},
}

var optimizeCmd = &cobra.Command{
	Use:     "optimize",
	Aliases: []string{"tune", "boost"},
	Short:   "Run macOS performance optimizations (DNS flush, QuickLook reset, memory purge)",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Running system performance optimizations...")
		res := internalsys.RunOptimization()
		for _, msg := range res.Messages {
			fmt.Println(" ", msg)
		}
		fmt.Println("\n✔ System optimization completed.")
		return nil
	},
}

var uninstallCmd = &cobra.Command{
	Use:   "uninstall <app-name>",
	Short: "Deep uninstall an application and purge all associated leftovers",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		appName := args[0]
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		homeDir, _ := os.UserHomeDir()

		leftovers := internalsys.FindAppLeftovers(appName, homeDir)
		if leftovers.AppPath == "" && len(leftovers.Leftovers) == 0 {
			fmt.Printf("No app or leftovers found matching '%s'.\n", appName)
			return nil
		}

		fmt.Printf("Found application components for '%s':\n", appName)
		if leftovers.AppPath != "" {
			fmt.Printf("  [App Bundle]  %s\n", leftovers.AppPath)
		}
		for _, l := range leftovers.Leftovers {
			fmt.Printf("  [Leftover]    %s\n", l)
		}

		sz, cnt, err := internalsys.DeepUninstall(leftovers, dryRun)
		if err != nil {
			return err
		}

		modeStr := "Removed"
		if dryRun {
			modeStr = "Identified for removal (Dry-run)"
		}

		fmt.Printf("\n✔ %s: %d components (%s total space).\n", modeStr, cnt, internalsys.FormatBytes(sz))
		return nil
	},
}

var dsStoreCmd = &cobra.Command{
	Use:   "ds-store [dir]",
	Short: "Clean .DS_Store clutter files recursively",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir := "."
		if len(args) > 0 {
			dir = args[0]
		}
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		sz, cnt, err := internalsys.CleanDSStore(dir, dryRun)
		if err != nil {
			return err
		}
		fmt.Printf("✔ Cleaned %d .DS_Store files (%s recovered).\n", cnt, internalsys.FormatBytes(sz))
		return nil
	},
}

func init() {
	cleanCmd.Flags().BoolP("dry-run", "n", false, "Preview cleanable files without deleting")
	purgeCmd.Flags().BoolP("dry-run", "n", false, "Preview purgable caches without deleting")
	analyzeCmd.Flags().Int64P("min-size", "m", 50, "Minimum file/directory size in MB")
	uninstallCmd.Flags().BoolP("dry-run", "n", false, "Preview leftover paths without deleting")
	dsStoreCmd.Flags().BoolP("dry-run", "n", false, "Preview .DS_Store files without deleting")

	Cmd.AddCommand(cleanCmd)
	Cmd.AddCommand(purgeCmd)
	Cmd.AddCommand(analyzeCmd)
	Cmd.AddCommand(statusCmd)
	Cmd.AddCommand(optimizeCmd)
	Cmd.AddCommand(uninstallCmd)
	Cmd.AddCommand(dsStoreCmd)
}
