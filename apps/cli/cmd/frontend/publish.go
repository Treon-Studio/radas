package frontend

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

var (
	publishAccess  string
	publishTag     string
	publishDryRun  bool
	publishOtp     string
	publishNoBuild bool
	publishBump    string
)

// PublishCmd is the command to publish npm package
var PublishCmd = &cobra.Command{
	Use:   "publish [package-path]",
	Short: "Publish npm package to registry",
	Long: `Publish an npm package to the registry with version management.

This command helps you:
  - Bump version (patch, minor, major, or custom)
  - Run build before publishing (optional)
  - Publish to npm registry with various options

Examples:
  radas fe publish                      # Publish current directory
  radas fe publish ./packages/ui        # Publish specific package
  radas fe publish --bump patch         # Auto bump patch version
  radas fe publish --bump minor         # Auto bump minor version
  radas fe publish --bump major         # Auto bump major version
  radas fe publish --access public      # Publish as public package
  radas fe publish --tag beta           # Publish with beta tag
  radas fe publish --dry-run            # Test publish without actually publishing
  radas fe publish --no-build           # Skip build step`,
	Run: runPublish,
}

func init() {
	PublishCmd.Flags().StringVar(&publishAccess, "access", "", "Package access level (public or restricted)")
	PublishCmd.Flags().StringVar(&publishTag, "tag", "", "Publish with a specific dist-tag (e.g., beta, next)")
	PublishCmd.Flags().BoolVar(&publishDryRun, "dry-run", false, "Run publish in dry-run mode (no actual publish)")
	PublishCmd.Flags().StringVar(&publishOtp, "otp", "", "One-time password for 2FA")
	PublishCmd.Flags().BoolVar(&publishNoBuild, "no-build", false, "Skip build step before publishing")
	PublishCmd.Flags().StringVarP(&publishBump, "bump", "b", "", "Version bump type (patch, minor, major, or specific version)")
}

func runPublish(cmd *cobra.Command, args []string) {
	// Determine package path
	packagePath := "."
	if len(args) > 0 {
		packagePath = args[0]
	}

	// Check for monorepo and let user select package if no path specified
	if len(args) == 0 && isMonorepo() {
		selectedPath := selectPackageToPublish()
		if selectedPath == "" {
			return
		}
		packagePath = selectedPath
	}

	// Read package.json
	pkgJsonPath := filepath.Join(packagePath, "package.json")
	if !fileExists(pkgJsonPath) {
		fmt.Printf("Error: package.json not found in %s\n", packagePath)
		return
	}

	pkg, err := readPackageJSON(pkgJsonPath)
	if err != nil {
		fmt.Printf("Error reading package.json: %v\n", err)
		return
	}

	// Check if package is private
	if pkg.Private {
		fmt.Println("Error: This package is marked as private in package.json")
		fmt.Println("Remove \"private\": true from package.json to publish")
		return
	}

	fmt.Println()
	fmt.Println("  📦 NPM Publish")
	fmt.Println("  ==============")
	fmt.Println()
	fmt.Printf("  Package: %s\n", pkg.Name)
	fmt.Printf("  Current Version: %s\n", pkg.Version)
	fmt.Printf("  Path: %s\n", packagePath)
	fmt.Println()

	// Handle version bump
	newVersion := pkg.Version
	if publishBump != "" {
		newVersion = bumpVersion(pkg.Version, publishBump)
	} else {
		// Ask user for version bump
		newVersion = promptVersionBump(pkg.Version)
	}

	if newVersion == "" {
		fmt.Println("  Aborted.")
		return
	}

	if newVersion != pkg.Version {
		fmt.Printf("  New Version: %s\n", newVersion)
		fmt.Println()

		// Update version in package.json
		if err := updatePackageVersion(pkgJsonPath, newVersion); err != nil {
			fmt.Printf("Error updating version: %v\n", err)
			return
		}
		fmt.Printf("  ✓ Updated version to %s\n", newVersion)
	}

	// Run build if not skipped
	if !publishNoBuild {
		if _, hasBuild := pkg.Scripts["build"]; hasBuild {
			fmt.Println()
			fmt.Println("  Running build...")
			if err := runNpmScript(packagePath, "build"); err != nil {
				fmt.Printf("  ✗ Build failed: %v\n", err)
				return
			}
			fmt.Println("  ✓ Build completed")
		}
	}

	// Confirm publish
	if !publishDryRun {
		fmt.Println()
		var confirm bool
		prompt := &survey.Confirm{
			Message: fmt.Sprintf("Publish %s@%s to npm?", pkg.Name, newVersion),
			Default: false,
		}
		if err := survey.AskOne(prompt, &confirm); err != nil || !confirm {
			fmt.Println("  Aborted.")
			return
		}
	}

	// Run npm publish
	fmt.Println()
	fmt.Println("  Publishing to npm...")
	if err := runNpmPublish(packagePath); err != nil {
		fmt.Printf("  ✗ Publish failed: %v\n", err)
		return
	}

	if publishDryRun {
		fmt.Println("  ✓ Dry run completed (no actual publish)")
	} else {
		fmt.Printf("  ✓ Successfully published %s@%s\n", pkg.Name, newVersion)
	}
}

func selectPackageToPublish() string {
	// Find publishable packages (non-private with package.json)
	var packages []struct {
		name string
		path string
	}

	// Check packages directory
	packagesDir := "packages"
	if dirExists(packagesDir) {
		entries, _ := os.ReadDir(packagesDir)
		for _, entry := range entries {
			if entry.IsDir() {
				pkgPath := filepath.Join(packagesDir, entry.Name())
				pkgJsonPath := filepath.Join(pkgPath, "package.json")
				if fileExists(pkgJsonPath) {
					pkg, err := readPackageJSON(pkgJsonPath)
					if err == nil && !pkg.Private {
						packages = append(packages, struct {
							name string
							path string
						}{pkg.Name, pkgPath})
					}
				}
			}
		}
	}

	// Check libs directory
	libsDir := "libs"
	if dirExists(libsDir) {
		entries, _ := os.ReadDir(libsDir)
		for _, entry := range entries {
			if entry.IsDir() {
				pkgPath := filepath.Join(libsDir, entry.Name())
				pkgJsonPath := filepath.Join(pkgPath, "package.json")
				if fileExists(pkgJsonPath) {
					pkg, err := readPackageJSON(pkgJsonPath)
					if err == nil && !pkg.Private {
						packages = append(packages, struct {
							name string
							path string
						}{pkg.Name, pkgPath})
					}
				}
			}
		}
	}

	if len(packages) == 0 {
		fmt.Println("No publishable packages found in monorepo")
		fmt.Println("Make sure packages don't have \"private\": true in package.json")
		return ""
	}

	options := make([]string, len(packages))
	for i, pkg := range packages {
		options[i] = fmt.Sprintf("%s (%s)", pkg.name, pkg.path)
	}

	var selected string
	prompt := &survey.Select{
		Message: "Select package to publish:",
		Options: options,
	}
	if err := survey.AskOne(prompt, &selected); err != nil {
		return ""
	}

	// Extract path from selection
	for _, pkg := range packages {
		if fmt.Sprintf("%s (%s)", pkg.name, pkg.path) == selected {
			return pkg.path
		}
	}

	return ""
}

func readPackageJSON(path string) (*PackageJSON, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var pkg PackageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, err
	}

	return &pkg, nil
}

func promptVersionBump(currentVersion string) string {
	// Parse current version
	parts := strings.Split(currentVersion, ".")
	if len(parts) != 3 {
		// Non-standard version, just use as-is or prompt for custom
		var customVersion string
		prompt := &survey.Input{
			Message: "Enter new version:",
			Default: currentVersion,
		}
		if err := survey.AskOne(prompt, &customVersion); err != nil {
			return ""
		}
		return customVersion
	}

	// Calculate next versions
	patchVersion := bumpVersion(currentVersion, "patch")
	minorVersion := bumpVersion(currentVersion, "minor")
	majorVersion := bumpVersion(currentVersion, "major")

	options := []string{
		fmt.Sprintf("patch (%s)", patchVersion),
		fmt.Sprintf("minor (%s)", minorVersion),
		fmt.Sprintf("major (%s)", majorVersion),
		fmt.Sprintf("keep current (%s)", currentVersion),
		"custom version",
	}

	var selected string
	prompt := &survey.Select{
		Message: "Select version bump:",
		Options: options,
		Default: options[0],
	}
	if err := survey.AskOne(prompt, &selected); err != nil {
		return ""
	}

	switch {
	case strings.HasPrefix(selected, "patch"):
		return patchVersion
	case strings.HasPrefix(selected, "minor"):
		return minorVersion
	case strings.HasPrefix(selected, "major"):
		return majorVersion
	case strings.HasPrefix(selected, "keep"):
		return currentVersion
	case selected == "custom version":
		var customVersion string
		inputPrompt := &survey.Input{
			Message: "Enter custom version:",
			Default: currentVersion,
		}
		if err := survey.AskOne(inputPrompt, &customVersion); err != nil {
			return ""
		}
		return customVersion
	}

	return currentVersion
}

func bumpVersion(version, bumpType string) string {
	// Handle prerelease versions (e.g., 1.0.0-beta.1)
	baseVersion := version
	prerelease := ""
	if idx := strings.Index(version, "-"); idx != -1 {
		baseVersion = version[:idx]
		prerelease = version[idx:]
	}

	parts := strings.Split(baseVersion, ".")
	if len(parts) != 3 {
		return version
	}

	major := parseInt(parts[0])
	minor := parseInt(parts[1])
	patch := parseInt(parts[2])

	switch bumpType {
	case "patch":
		patch++
	case "minor":
		minor++
		patch = 0
	case "major":
		major++
		minor = 0
		patch = 0
	default:
		// Custom version - return as-is if it looks like a version
		if strings.Contains(bumpType, ".") {
			return bumpType
		}
		return version
	}

	// Clear prerelease on bump
	if prerelease != "" && (bumpType == "patch" || bumpType == "minor" || bumpType == "major") {
		prerelease = ""
	}

	return fmt.Sprintf("%d.%d.%d%s", major, minor, patch, prerelease)
}

func parseInt(s string) int {
	var n int
	fmt.Sscanf(s, "%d", &n)
	return n
}

func updatePackageVersion(pkgJsonPath, newVersion string) error {
	// Read current package.json
	data, err := os.ReadFile(pkgJsonPath)
	if err != nil {
		return err
	}

	// Parse as generic map to preserve all fields
	var pkg map[string]interface{}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return err
	}

	// Update version
	pkg["version"] = newVersion

	// Write back with indentation
	newData, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(pkgJsonPath, newData, 0644)
}

func runNpmScript(dir, script string) error {
	// Detect package manager
	var cmd *exec.Cmd
	switch {
	case fileExists(filepath.Join(dir, "pnpm-lock.yaml")):
		cmd = exec.Command("pnpm", "run", script)
	case fileExists(filepath.Join(dir, "yarn.lock")):
		cmd = exec.Command("yarn", script)
	case fileExists(filepath.Join(dir, "bun.lockb")):
		cmd = exec.Command("bun", "run", script)
	default:
		cmd = exec.Command("npm", "run", script)
	}

	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

func runNpmPublish(dir string) error {
	args := []string{"publish"}

	// Add flags
	if publishAccess != "" {
		args = append(args, "--access", publishAccess)
	}
	if publishTag != "" {
		args = append(args, "--tag", publishTag)
	}
	if publishDryRun {
		args = append(args, "--dry-run")
	}
	if publishOtp != "" {
		args = append(args, "--otp", publishOtp)
	}

	// Detect package manager for publish
	var cmd *exec.Cmd
	switch {
	case fileExists(filepath.Join(dir, "pnpm-lock.yaml")):
		cmd = exec.Command("pnpm", args...)
	case fileExists(filepath.Join(dir, "yarn.lock")):
		// yarn uses slightly different syntax
		cmd = exec.Command("yarn", "npm", "publish")
		if publishAccess != "" {
			cmd.Args = append(cmd.Args, "--access", publishAccess)
		}
		if publishTag != "" {
			cmd.Args = append(cmd.Args, "--tag", publishTag)
		}
	default:
		cmd = exec.Command("npm", args...)
	}

	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	return cmd.Run()
}
