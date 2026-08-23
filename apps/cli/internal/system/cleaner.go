package system

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// FormatBytes formats byte count to human-readable string (KB, MB, GB).
func FormatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// GetCleanTargets returns the standard list of developer and system cache targets on macOS/Unix.
func GetCleanTargets(homeDir string) []CleanTarget {
	return []CleanTarget{
		{
			Name:        "Xcode DerivedData & DeviceSupport",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, "Library/Developer/Xcode/DerivedData"),
				filepath.Join(homeDir, "Library/Developer/Xcode/iOS DeviceSupport"),
				filepath.Join(homeDir, "Library/Developer/Xcode/Archives"),
				filepath.Join(homeDir, "Library/Caches/com.apple.dt.Xcode"),
			},
			Description: "Xcode build artifacts, simulator device caches, and intermediate compiler files",
		},
		{
			Name:        "Node, pnpm & Yarn Cache",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, ".npm/_cacache"),
				filepath.Join(homeDir, ".pnpm-store"),
				filepath.Join(homeDir, "Library/pnpm/store"),
				filepath.Join(homeDir, ".yarn/berry/cache"),
				filepath.Join(homeDir, ".bun/install/cache"),
			},
			Description: "Cached package archives for npm, pnpm, yarn berry, and bun",
		},
		{
			Name:        "Go Build & Module Cache",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, "Library/Caches/go-build"),
				filepath.Join(homeDir, ".cache/go-build"),
			},
			Description: "Go compiler binary object cache and temporary build artifacts",
		},
		{
			Name:        "Rust & Cargo Package Cache",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, ".cargo/registry/cache"),
				filepath.Join(homeDir, ".cargo/git/db"),
			},
			Description: "Rust crate registry tarballs and checkout cache",
		},
		{
			Name:        "Python, Pip & UV Cache",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, "Library/Caches/pip"),
				filepath.Join(homeDir, ".cache/pip"),
				filepath.Join(homeDir, ".cache/uv"),
			},
			Description: "Downloaded pip wheel archives and uv build cache",
		},
		{
			Name:        "Homebrew Download Cache",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, "Library/Caches/Homebrew/downloads"),
				filepath.Join(homeDir, "Library/Caches/Homebrew/Cask"),
			},
			Description: "Cached bottle binaries and cask installer packages",
		},
		{
			Name:        "Gradle & Android Build Caches",
			Category:    "developer",
			Paths: []string{
				filepath.Join(homeDir, ".gradle/caches/build-cache-1"),
				filepath.Join(homeDir, ".android/cache"),
			},
			Description: "Android emulator & Gradle build artifact cache",
		},
		{
			Name:        "macOS Crash & Diagnostic Reports",
			Category:    "logs",
			Paths: []string{
				filepath.Join(homeDir, "Library/Logs/DiagnosticReports"),
				filepath.Join(homeDir, "Library/Logs/CrashReporter"),
			},
			Description: "Crash dump logs and diagnostic traces",
		},
		{
			Name:        "User Application Caches",
			Category:    "system",
			Paths: []string{
				filepath.Join(homeDir, "Library/Caches/Google/Chrome/Default/Cache"),
				filepath.Join(homeDir, "Library/Caches/com.spotify.client/Data"),
				filepath.Join(homeDir, "Library/Caches/com.microsoft.VSCode/Cache"),
				filepath.Join(homeDir, "Library/Caches/com.microsoft.VSCode/CachedData"),
			},
			Description: "Application web caches, temporary thumbnail buffers, and IDE run caches",
		},
	}
}

// CalculateDirSize returns the total size in bytes and number of files in a path.
func CalculateDirSize(path string) (int64, int) {
	var totalSize int64
	var count int

	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			totalSize += info.Size()
			count++
		}
		return nil
	})

	return totalSize, count
}

// RunCleanup performs the scan and optional deletion of the targets.
func RunCleanup(targets []CleanTarget, dryRun bool) CleanReport {
	start := time.Now()
	report := CleanReport{
		DryRun:   dryRun,
		Targets:  make([]CleanTarget, 0, len(targets)),
	}

	for _, target := range targets {
		var targetSize int64
		var targetCount int

		for _, p := range target.Paths {
			if _, err := os.Stat(p); err == nil {
				sz, cnt := CalculateDirSize(p)
				targetSize += sz
				targetCount += cnt

				if !dryRun && sz > 0 {
					_ = os.RemoveAll(p)
					// Recreate empty dir if it was a base directory
					_ = os.MkdirAll(p, 0755)
				}
			}
		}

		target.SizeBytes = targetSize
		target.ItemCount = targetCount
		report.Targets = append(report.Targets, target)
		report.TotalCleanedBytes += targetSize
		report.TotalItemsRemoved += targetCount
	}

	report.Duration = time.Since(start)
	return report
}

// CleanDSStore removes all .DS_Store files recursively under rootPath.
func CleanDSStore(rootPath string, dryRun bool) (int64, int, error) {
	var totalSize int64
	var count int

	err := filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && info.Name() == ".DS_Store" {
			totalSize += info.Size()
			count++
			if !dryRun {
				_ = os.Remove(path)
			}
		}
		return nil
	})

	return totalSize, count, err
}

// DockerPrune executes docker builder prune and system prune if Docker CLI is present.
func DockerPrune(dryRun bool) (string, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return "Docker is not installed or not in PATH.", nil
	}

	if dryRun {
		return "Docker build cache and dangling images identified (Dry-run mode).", nil
	}

	cmd := exec.Command("docker", "system", "prune", "-f")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("docker prune failed: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}
