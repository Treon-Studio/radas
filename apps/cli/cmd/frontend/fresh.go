package frontend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
	"radas/internal/checker"
	"radas/internal/utils"
)

// FreshCmd is the command to perform a fresh install of frontend dependencies
var FreshCmd = &cobra.Command{
	Use:   "fresh [app-name]",
	Short: "Perform a fresh install",
	Long:  `Clean node_modules and lock files, then reinstall all dependencies based on the project configuration.
In a monorepo, you can specify an app name to perform a fresh install on only that app, or run without arguments for the current directory.`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			// App name provided, fresh install specific app
			appName := args[0]
			runFreshInstallForApp(appName)
		} else {
			// Fresh install current directory
			runFreshInstall(".")
		}
	},
}

// runFreshInstallForApp checks if in monorepo structure and performs fresh install for specific app
func runFreshInstallForApp(appName string) {
	// Check if apps directory exists (monorepo structure)
	if dirExists("apps") {
		appPath := filepath.Join("apps", appName)
		if dirExists(appPath) {
			fmt.Printf("Fresh installing app: %s\n", appName)
			runFreshInstall(appPath)
		} else {
			fmt.Printf("App '%s' not found in apps directory\n", appName)
			// Show available apps
			listAvailableApps()
		}
	} else {
		fmt.Println("Not in a monorepo root or apps directory not found")
		runFreshInstall(".")
	}
}

// runFreshInstall performs fresh install in specified directory
func runFreshInstall(dir string) {
	// First run the clean process for this directory
	runFrontendClean(dir)
	
	fmt.Println("Performing fresh install...")
	
	// Change to directory if not current
	currentDir, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error getting current directory: %v\n", err)
		return
	}
	
	// Only change directory if we're not already in the target directory
	if dir != "." {
		err = os.Chdir(dir)
		if err != nil {
			fmt.Printf("Error changing to directory %s: %v\n", dir, err)
			return
		}
		defer func() {
			// Change back to original directory when done
			if err := os.Chdir(currentDir); err != nil {
				fmt.Printf("Error changing back to original directory: %v\n", err)
			}
		}()
	}
	
	// Detect package manager and perform install
	switch {
	case fileExists("package.json"):
		// Check for bun
		wasBun := fileExists("bun.lockb")
		
		if wasBun && utils.CheckIfCommandExists("bun") {
			fmt.Println("Installing with bun...")
			cmd := exec.Command("bun", "install")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			err := cmd.Run()
			if err != nil {
				fmt.Printf("Error installing with bun: %v\n", err)
			} else {
				fmt.Println("✓ Bun install completed successfully")
			}
			return
		}
		
		// Otherwise, use checker's existing function
		checker.InstallFrontendDependencies()
	default:
		fmt.Println("No package.json found. Cannot install dependencies.")
	}
} 