package frontend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"github.com/spf13/cobra"
	"github.com/AlecAivazis/survey/v2"
)

// BuildCmd is the command to build frontend application
var BuildCmd = &cobra.Command{
	Use:   "build [app-name]",
	Short: "Build frontend application",
	Long:  `Build the frontend application. In a monorepo, you can specify an app name to build, or choose from a list if no app name is provided. Automatically detects and uses npm, pnpm, bun, or yarn based on lock files.`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) > 0 {
			appName := args[0]
			runBuildByName(appName)
		} else {
			if fileExists("package.json") && fileExists("radas.yml") {
				if isMonorepoYml("radas.yml") {
					selectAndBuildApp()
					return
				}
			}
			if isMonorepo() {
				selectAndBuildApp()
			} else {
				runFrontendBuild(".")
			}
		}
	},
}

// runBuildByName builds the app by name
func runBuildByName(appName string) {
	if isMonorepo() {
		appPath := filepath.Join("apps", appName)
		if dirExists(appPath) && fileExists(filepath.Join(appPath, "package.json")) {
			fmt.Printf("Building app: %s\n", appName)
			runFrontendBuild(appPath)
		} else {
			fmt.Printf("App '%s' not found or doesn't have a package.json\n", appName)
			selectAndBuildApp()
		}
	} else {
		if fileExists("package.json") {
			runFrontendBuild(".")
		} else {
			fmt.Println("Not in a valid frontend app directory (no package.json found)")
		}
	}
}

// selectAndBuildApp lets user choose app to build
func selectAndBuildApp() {
	apps := findAppsInMonorepo()
	if len(apps) == 0 {
		fmt.Println("No apps found in the monorepo")
		return
	}
	var options []string
	for _, app := range apps {
		options = append(options, app.Name)
	}
	var selected string
	prompt := &survey.Select{
		Message: "Select an app to build:",
		Options: options,
	}
	err := survey.AskOne(prompt, &selected)
	if err != nil {
		fmt.Println("Prompt cancelled.")
		return
	}
	var selectedApp AppInfo
	for _, app := range apps {
		if app.Name == selected {
			selectedApp = app
			break
		}
	}
	fmt.Printf("Building app: %s\n", selectedApp.Name)
	runFrontendBuild(selectedApp.Path)
}

// runFrontendBuild runs the build script in the given directory
func runFrontendBuild(dir string) {
	// Detect and run the build script using the package manager
	cmd, args := detectBuildCommand(dir)
	if cmd == "" {
		fmt.Println("No build script or package manager found.")
		return
	}
	fmt.Printf("Running '%s %s' in %s\n", cmd, args, dir)
	c := buildCmd(cmd, args, dir)
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	if err := c.Run(); err != nil {
		fmt.Printf("Build failed: %v\n", err)
		return
	}
	fmt.Println("Build completed successfully!")
}

// detectBuildCommand returns the package manager and args for build
func detectBuildCommand(dir string) (string, string) {
	if fileExists(filepath.Join(dir, "pnpm-lock.yaml")) {
		return "pnpm", "build"
	}
	if fileExists(filepath.Join(dir, "yarn.lock")) {
		return "yarn", "build"
	}
	if fileExists(filepath.Join(dir, "bun.lockb")) {
		return "bun", "run build"
	}
	if fileExists(filepath.Join(dir, "package-lock.json")) {
		return "npm", "run build"
	}
	return "", ""
}

// buildCmd returns the exec.Cmd for given command and args
func buildCmd(cmd, args, dir string) *exec.Cmd {
	var c *exec.Cmd
	if args == "" {
		c = exec.Command(cmd)
	} else {
		c = exec.Command(cmd, args)
	}
	c.Dir = dir
	return c
}
