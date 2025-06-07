package frontend

import (
	"os"
	"path/filepath"
	"fmt"
	"github.com/spf13/cobra"
)

// CleanCmd is the command to clean frontend dependencies
var CleanCmd = &cobra.Command{
	Use:   "clean [app-name]",
	Short: "Clean frontend dependencies",
	Long:  `Remove node_modules directory and lock files related to Node.js, Bun, and PNPM projects. 
In a monorepo, you can specify an app name to clean only that app, or run without arguments to clean the current directory.`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			// App name provided, clean specific app
			appName := args[0]
			runFrontendCleanForApp(appName)
		} else {
			// Clean current directory
			runFrontendClean(".")
		}
	},
}

// runFrontendCleanForApp checks if in monorepo structure and cleans specific app
func runFrontendCleanForApp(appName string) {
	// Check if apps directory exists (monorepo structure)
	if dirExists("apps") {
		appPath := filepath.Join("apps", appName)
		if dirExists(appPath) {
			fmt.Printf("Cleaning app: %s\n", appName)
			runFrontendClean(appPath)
		} else {
			fmt.Printf("App '%s' not found in apps directory\n", appName)
			// Show available apps
			listAvailableApps()
		}
	} else {
		fmt.Println("Not in a monorepo root or apps directory not found")
		runFrontendClean(".")
	}
}

// runFrontendClean performs clean operation in specified directory
func runFrontendClean(dir string) {
	// Remove node_modules directory
	nodeModulesPath := filepath.Join(dir, "node_modules")
	if dirExists(nodeModulesPath) {
		fmt.Println("Removing node_modules directory...")
		err := os.RemoveAll(nodeModulesPath)
		if err != nil {
			fmt.Printf("Error removing node_modules: %v\n", err)
		} else {
			fmt.Println("✓ node_modules removed successfully")
		}
	}

	// Remove lock files
	lockFiles := []string{
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml", 
		"bun.lockb",
	}

	for _, file := range lockFiles {
		filePath := filepath.Join(dir, file)
		if fileExists(filePath) {
			fmt.Printf("Removing %s...\n", file)
			err := os.Remove(filePath)
			if err != nil {
				fmt.Printf("Error removing %s: %v\n", file, err)
			} else {
				fmt.Printf("✓ %s removed successfully\n", file)
			}
		}
	}

	fmt.Println("Frontend clean completed")
}

// Helper functions
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return !os.IsNotExist(err)
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return false
	}
	return info.IsDir()
}

// listAvailableApps lists all available apps in the monorepo
func listAvailableApps() {
	if !dirExists("apps") {
		fmt.Println("No apps directory found")
		return
	}

	entries, err := os.ReadDir("apps")
	if err != nil {
		fmt.Printf("Error reading apps directory: %v\n", err)
		return
	}

	if len(entries) == 0 {
		fmt.Println("No apps found in apps directory")
		return
	}

	fmt.Println("Available apps:")
	for _, entry := range entries {
		if entry.IsDir() {
			// Check if the directory contains a package.json file
			packagePath := filepath.Join("apps", entry.Name(), "package.json")
			if fileExists(packagePath) {
				fmt.Printf("- %s\n", entry.Name())
			}
		}
	}
} 