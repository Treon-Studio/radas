package frontend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"github.com/spf13/cobra"
	"radas/internal/checker"
	"github.com/AlecAivazis/survey/v2"
)

// DevCmd is the command to run frontend application
var DevCmd = &cobra.Command{
	Use:   "dev [app-name]",
	Short: "Run frontend application",
	Long:  `Start the frontend application in development mode. Automatically detects and uses npm, pnpm, bun, or yarn based on lock files.
In a monorepo, you can specify an app name to run, or choose from a list if no app name is provided.`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			// App name provided, run specific app
			appName := args[0]
			runAppByName(appName)
		} else {
			// --- MONOREPO DETECTION LOGIC ---
			if fileExists("package.json") && fileExists("radas.yml") {
				if isMonorepoYml("radas.yml") {
					// Always show app selection if monorepo
					selectAndRunApp()
					return
				}
			}
			// Fallback to previous logic
			if isMonorepo() {
				// Show app selection menu
				selectAndRunApp()
			} else {
				// Run app in current directory
				runFrontendDev(".")
			}
		}
	},
}

// Package JSON structure for parsing
type PackageJSON struct {
	Name    string            `json:"name"`
	Scripts map[string]string `json:"scripts"`
}

// Runs the development server for an app in the specified directory
func runFrontendDev(dir string) {
	// Use the existing StartApp function from internal/checker to run the app
	err := checker.StartApp(dir)
	if err != nil {
		fmt.Printf("Failed to start frontend application: %v\n", err)
	}
}

// Check if we're in a monorepo root
func isMonorepo() bool {
	return dirExists("apps") && !fileExists("package.json")
}

// Run application by name
func runAppByName(appName string) {
	if isMonorepo() {
		appPath := filepath.Join("apps", appName)
		if dirExists(appPath) && fileExists(filepath.Join(appPath, "package.json")) {
			fmt.Printf("Starting app: %s\n", appName)
			runFrontendDev(appPath)
		} else {
			fmt.Printf("App '%s' not found or doesn't have a package.json\n", appName)
			selectAndRunApp()
		}
	} else {
		// Check if we're already in an app directory
		if fileExists("package.json") {
			runFrontendDev(".")
		} else {
			fmt.Println("Not in a valid frontend app directory (no package.json found)")
		}
	}
}

// Select and run an app from the monorepo
func selectAndRunApp() {
	apps := findAppsInMonorepo()
	if len(apps) == 0 {
		fmt.Println("No apps found in the monorepo")
		return
	}

	// Prepare options for survey
	var options []string
	for _, app := range apps {
		options = append(options, app.Name)
	}

	var selected string
	prompt := &survey.Select{
		Message: "Select an app to run:",
		Options: options,
	}
	err := survey.AskOne(prompt, &selected)
	if err != nil {
		fmt.Println("Prompt cancelled.")
		return
	}

	// Find selected app
	var selectedApp AppInfo
	for _, app := range apps {
		if app.Name == selected {
			selectedApp = app
			break
		}
	}

	fmt.Printf("Starting app: %s\n", selectedApp.Name)
	runFrontendDev(selectedApp.Path)
}

// App info structure
type AppInfo struct {
	Name string
	Path string
}

// Find all apps in the monorepo
func findAppsInMonorepo() []AppInfo {
	var apps []AppInfo

	if !dirExists("apps") {
		return apps
	}

	entries, err := os.ReadDir("apps")
	if err != nil {
		fmt.Printf("Error reading apps directory: %v\n", err)
		return apps
	}

	for _, entry := range entries {
		if entry.IsDir() {
			appPath := filepath.Join("apps", entry.Name())
			packagePath := filepath.Join(appPath, "package.json")
			
			if fileExists(packagePath) {
				// Read package.json to get app name
				data, err := os.ReadFile(packagePath)
				if err != nil {
					continue
				}
				
				var pkgInfo PackageJSON
				if err := json.Unmarshal(data, &pkgInfo); err != nil {
					continue
				}
				
				name := pkgInfo.Name
				if name == "" {
					name = entry.Name() // Fallback to directory name
				}
				
				apps = append(apps, AppInfo{
					Name: name,
					Path: appPath,
				})
			}
		}
	}

	return apps
} 