package checker

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"radas/internal/utils"
)

// CheckNodeJS checks the Node.js installation
func CheckNodeJS() bool {
	fmt.Print("Checking Node.js: ")

	if !utils.CheckIfCommandExists("node") {
		utils.Failure("✘ Node.js not found\n")
		fmt.Println("  Please install Node.js from https://nodejs.org/")
		return false
	}

	output, err := utils.ExecuteCommand("node", "-v")
	if err != nil {
		utils.Failure("✘ Failed to get Node.js version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckNPM checks the npm installation
func CheckNPM() bool {
	fmt.Print("Checking npm: ")

	if !utils.CheckIfCommandExists("npm") {
		utils.Failure("✘ npm not found\n")
		fmt.Println("  npm is usually installed along with Node.js")
		return false
	}

	output, err := utils.ExecuteCommand("npm", "-v")
	if err != nil {
		utils.Failure("✘ Failed to get npm version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckYarn checks the Yarn installation
func CheckYarn() bool {
	fmt.Print("Checking Yarn: ")

	if !utils.CheckIfCommandExists("yarn") {
		utils.Failure("✘ Yarn not found\n")
		fmt.Println("  Please install Yarn with: npm install -g yarn")
		return false
	}

	output, err := utils.ExecuteCommand("yarn", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get Yarn version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// CheckPnpm checks the pnpm installation
func CheckPnpm() bool {
	fmt.Print("Checking pnpm: ")

	if !utils.CheckIfCommandExists("pnpm") {
		utils.Failure("✘ pnpm not found\n")
		fmt.Println("  Please install pnpm with: npm install -g pnpm")
		return false
	}

	output, err := utils.ExecuteCommand("pnpm", "--version")
	if err != nil {
		utils.Failure("✘ Failed to get pnpm version\n")
		return false
	}

	version := strings.TrimSpace(output)
	utils.Success("✓ Installed (%s)\n", version)
	return true
}

// InstallFrontendDependencies installs frontend dependencies based on the lock file
func InstallFrontendDependencies() {
	// Check for package-lock.json
	if utils.FileExists("package-lock.json") {
		fmt.Println("package-lock.json found, running npm install...")
		
		cmd := exec.Command("npm", "install")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err := cmd.Run()
		
		if err != nil {
			utils.Failure("✘ npm install failed: %v\n", err)
		} else {
			utils.Success("✓ npm install completed successfully\n")
		}
		return
	}

	// Check for pnpm-lock.yaml
	if utils.FileExists("pnpm-lock.yaml") {
		fmt.Println("pnpm-lock.yaml found, running pnpm install...")
		
		if !utils.CheckIfCommandExists("pnpm") {
			utils.Failure("✘ pnpm not found, please install with: npm install -g pnpm\n")
			return
		}
		
		cmd := exec.Command("pnpm", "i")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err := cmd.Run()
		
		if err != nil {
			utils.Failure("✘ pnpm install failed: %v\n", err)
		} else {
			utils.Success("✓ pnpm install completed successfully\n")
		}
		return
	}

	// Check for yarn.lock
	if utils.FileExists("yarn.lock") {
		fmt.Println("yarn.lock found, running yarn install...")
		
		if !utils.CheckIfCommandExists("yarn") {
			utils.Failure("✘ yarn not found, please install with: npm install -g yarn\n")
			return
		}
		
		cmd := exec.Command("yarn")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err := cmd.Run()
		
		if err != nil {
			utils.Failure("✘ yarn install failed: %v\n", err)
		} else {
			utils.Success("✓ yarn install completed successfully\n")
		}
		return
	}

	// No lock file found
	utils.Warning("⚠ No lock file found (package-lock.json, pnpm-lock.yaml, or yarn.lock)\n")
}

// StartApp starts an app using its package.json scripts
// Preferred order: dev, start, serve
func StartApp(appDir string) error {
	// Check if package.json exists
	packagePath := filepath.Join(appDir, "package.json")
	if !utils.FileExists(packagePath) {
		return fmt.Errorf("no package.json found in %s", appDir)
	}

	// Read package.json
	pkg, err := utils.ReadPackageJSON(packagePath)
	if err != nil {
		return err
	}

	// Determine which script to run
	var scriptName string
	for _, script := range []string{"dev", "start", "serve"} {
		if _, ok := pkg.Scripts[script]; ok {
			scriptName = script
			break
		}
	}

	if scriptName == "" {
		return fmt.Errorf("no suitable start script found in package.json")
	}

	// Determine which package manager to use
	var cmd *exec.Cmd
	switch {
	case utils.FileExists(filepath.Join(appDir, "yarn.lock")):
		fmt.Printf("Starting %s with yarn %s...\n", pkg.Name, scriptName)
		cmd = exec.Command("yarn", scriptName)
	case utils.FileExists(filepath.Join(appDir, "pnpm-lock.yaml")):
		fmt.Printf("Starting %s with pnpm %s...\n", pkg.Name, scriptName)
		cmd = exec.Command("pnpm", scriptName)
	default:
		fmt.Printf("Starting %s with npm run %s...\n", pkg.Name, scriptName)
		cmd = exec.Command("npm", "run", scriptName)
	}

	// Set command directory and output
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Run the command
	return cmd.Run()
}

// FindAndListApps finds all available apps in the current directory or monorepo
func FindAndListApps() (map[string]string, error) {
	// Get current directory
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("error getting current directory: %v", err)
	}

	// Get apps list
	return utils.GetAppsList(cwd)
}