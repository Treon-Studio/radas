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
for cleaning developer caches (Xcode, Node/pnpm, Go, Rust, Pip, Docker, Homebrew, AI models),
analyzing heavy directories, diagnosing system hardware/thermals, and optimizing macOS.`,
}

var cleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Clean developer caches, AI model caches, application logs, and temporary files",
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		categoryFilter, _ := cmd.Flags().GetString("category")
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return err
		}

		allTargets := internalsys.GetCleanTargets(homeDir)
		var targets []internalsys.CleanTarget
		for _, t := range allTargets {
			if categoryFilter == "" || t.Category == categoryFilter {
				targets = append(targets, t)
			}
		}

		report := internalsys.RunCleanup(targets, dryRun)
		_ = internalsys.RecordCleanupAppended(report)

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "CATEGORY\tTARGET CACHE\tITEMS\tRECOVERABLE")
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
	Short: "Deep purge heavy build caches across Docker, Xcode, pnpm, Go, Cargo, and Android SDK",
	RunE: func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		fmt.Println("Initiating deep developer cache purge...")

		homeDir, _ := os.UserHomeDir()
		targets := internalsys.GetCleanTargets(homeDir)
		report := internalsys.RunCleanup(targets, dryRun)
		_ = internalsys.RecordCleanupAppended(report)

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
		showInsights, _ := cmd.Flags().GetBool("insights")
		minBytes := minMB * 1024 * 1024

		absDir, _ := filepath.Abs(dir)
		fmt.Printf("Scanning disk usage in '%s' (threshold: > %d MB)...\n\n", absDir, minMB)

		items, err := internalsys.AnalyzeDisk(absDir, minBytes, 2)
		if err != nil {
			return err
		}

		if len(items) == 0 {
			fmt.Printf("No items larger than %d MB found.\n", minMB)
		} else {
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
		}

		if showInsights {
			homeDir, _ := os.UserHomeDir()
			insights := internalsys.GenerateStorageInsights(homeDir)
			if len(insights) > 0 {
				fmt.Println("\n💡 Storage Optimization Insights:")
				for _, in := range insights {
					fmt.Printf("  • [%s] %s (%s) — %s\n", in.Type, in.Path, in.HumanSize, in.Description)
				}
			}
		}
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

var touchIDCmd = &cobra.Command{
	Use:   "touchid",
	Short: "Check or configure Touch ID authentication for sudo commands on macOS",
	RunE: func(cmd *cobra.Command, args []string) error {
		enabled, msg := internalsys.TouchIDStatus()
		fmt.Println("Touch ID Sudo Configuration:")
		fmt.Printf("  Status: %s\n\n", msg)
		if !enabled {
			fmt.Println("To enable Touch ID for sudo commands, run:")
			fmt.Printf("  %s\n", internalsys.GenerateTouchIDCommand())
		}
		return nil
	},
}

var historyCmd = &cobra.Command{
	Use:   "history",
	Short: "View historical summary of cleaned disk space over time",
	RunE: func(cmd *cobra.Command, args []string) error {
		ledger := internalsys.LoadHistory()
		fmt.Println("============================================================")
		fmt.Println("                 RADAS CLEANUP HISTORY                      ")
		fmt.Println("============================================================")
		fmt.Printf("  All-Time Space Cleaned:  %s\n", internalsys.FormatBytes(ledger.TotalAllTimeCleanedBytes))
		fmt.Printf("  Total Executions:        %d runs\n\n", ledger.TotalRuns)
		if len(ledger.Records) > 0 {
			w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
			fmt.Fprintln(w, "TIMESTAMP\tSPACE RECOVERED\tITEMS\tDURATION")
			for _, r := range ledger.Records {
				fmt.Fprintf(w, "%s\t%s\t%d\t%d ms\n", r.Timestamp, internalsys.FormatBytes(r.CleanedBytes), r.ItemCount, r.DurationMs)
			}
			w.Flush()
		} else {
			fmt.Println("No recorded cleanup runs yet.")
		}
		fmt.Println("============================================================")
		return nil
	},
}

var whitelistCmd = &cobra.Command{
	Use:   "whitelist [path]",
	Short: "View or add protected paths to the cleanup whitelist",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			rule := args[0]
			_ = internalsys.AddWhitelistRule(rule)
			fmt.Printf("✔ Added rule '%s' to whitelist.\n", rule)
			return nil
		}

		rules := internalsys.LoadWhitelist()
		fmt.Println("Protected Whitelist Paths:")
		if len(rules) > 0 {
			for _, r := range rules {
				fmt.Printf("  • %s\n", r)
			}
		} else {
			fmt.Println("  (No custom whitelist rules defined)")
		}
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
	cleanCmd.Flags().StringP("category", "c", "", "Filter by category (developer, ai, browser, system, logs)")

	purgeCmd.Flags().BoolP("dry-run", "n", false, "Preview purgable caches without deleting")

	analyzeCmd.Flags().Int64P("min-size", "m", 50, "Minimum file/directory size in MB")
	analyzeCmd.Flags().BoolP("insights", "i", true, "Show actionable storage recommendations")

	uninstallCmd.Flags().BoolP("dry-run", "n", false, "Preview leftover paths without deleting")
	dsStoreCmd.Flags().BoolP("dry-run", "n", false, "Preview .DS_Store files without deleting")

	Cmd.AddCommand(cleanCmd)
	Cmd.AddCommand(purgeCmd)
	Cmd.AddCommand(analyzeCmd)
	Cmd.AddCommand(statusCmd)
	Cmd.AddCommand(optimizeCmd)
	Cmd.AddCommand(uninstallCmd)
	Cmd.AddCommand(touchIDCmd)
	Cmd.AddCommand(historyCmd)
	Cmd.AddCommand(whitelistCmd)
	Cmd.AddCommand(dsStoreCmd)
}
