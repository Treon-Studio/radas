package system

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// FindAppLeftovers scans typical macOS user and system directories for files belonging to an application.
func FindAppLeftovers(appName, homeDir string) AppLeftover {
	cleanName := strings.TrimSuffix(appName, ".app")
	result := AppLeftover{
		AppName: cleanName,
	}

	// 1. Check primary application bundle
	appPaths := []string{
		fmt.Sprintf("/Applications/%s.app", cleanName),
		filepath.Join(homeDir, fmt.Sprintf("Applications/%s.app", cleanName)),
	}
	for _, p := range appPaths {
		if _, err := os.Stat(p); err == nil {
			result.AppPath = p
			sz, _ := CalculateDirSize(p)
			result.TotalBytes += sz
			break
		}
	}

	// 2. Common library leftover locations
	searchDirs := []string{
		filepath.Join(homeDir, "Library/Application Support"),
		filepath.Join(homeDir, "Library/Caches"),
		filepath.Join(homeDir, "Library/Preferences"),
		filepath.Join(homeDir, "Library/Saved Application State"),
		filepath.Join(homeDir, "Library/WebKit"),
		filepath.Join(homeDir, "Library/Logs"),
	}

	for _, baseDir := range searchDirs {
		entries, err := os.ReadDir(baseDir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			name := entry.Name()
			if strings.Contains(strings.ToLower(name), strings.ToLower(cleanName)) {
				fullPath := filepath.Join(baseDir, name)
				result.Leftovers = append(result.Leftovers, fullPath)
				sz, _ := CalculateDirSize(fullPath)
				result.TotalBytes += sz
			}
		}
	}

	return result
}

// DeepUninstall removes the main app bundle and all identified leftover files.
func DeepUninstall(leftover AppLeftover, dryRun bool) (int64, int, error) {
	var totalSize int64
	var count int

	allPaths := append([]string{}, leftover.Leftovers...)
	if leftover.AppPath != "" {
		allPaths = append([]string{leftover.AppPath}, allPaths...)
	}

	for _, p := range allPaths {
		if _, err := os.Stat(p); err == nil {
			sz, cnt := CalculateDirSize(p)
			totalSize += sz
			count += cnt
			if !dryRun {
				_ = os.RemoveAll(p)
			}
		}
	}

	return totalSize, count, nil
}
