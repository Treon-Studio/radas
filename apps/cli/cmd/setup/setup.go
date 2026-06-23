package setup

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/AlecAivazis/survey/v2"
	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/constants"
)

// Shell types supported
const (
	ShellZsh   = "zsh"
	ShellBash  = "bash"
	ShellFish  = "fish"
	ShellNix   = "nix"
)

// SetupCmd represents the setup command
var SetupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Setup Radas CLI aliases for your shell",
	Long: `Setup Radas CLI by automatically installing aliases to your shell configuration.

Supported shells:
  - zsh   (~/.zshrc)
  - bash  (~/.bashrc)
  - fish  (~/.config/fish/config.fish)
  - nix   (~/.config/home-manager/home.nix or shell.nix)

The command will:
  1. Auto-detect your shell (or use --shell flag)
  2. Detect if you're using Nix/home-manager
  3. Backup your config file before modifying
  4. Add Radas aliases (idempotent - won't duplicate)

Examples:
  radas setup              # Auto-detect shell and setup
  radas setup --shell=zsh  # Force zsh setup
  radas setup --shell=nix  # Setup for Nix home-manager`,
	Run: runSetup,
}

var (
	setupShellFlag string
	setupDryRun    bool
	setupForce     bool
)

func init() {
	SetupCmd.Flags().StringVarP(&setupShellFlag, "shell", "s", "", "Specify shell type (zsh, bash, fish, nix)")
	SetupCmd.Flags().BoolVar(&setupDryRun, "dry-run", false, "Show what would be done without making changes")
	SetupCmd.Flags().BoolVarP(&setupForce, "force", "f", false, "Force setup even if aliases already exist")
}

func runSetup(cmd *cobra.Command, args []string) {
	green := color.New(color.FgGreen).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()
	red := color.New(color.FgRed).SprintFunc()
	cyan := color.New(color.FgCyan).SprintFunc()

	fmt.Print(constants.RadasASCIIArt)
	fmt.Println()
	fmt.Println(cyan("Radas CLI Setup"))
	fmt.Println(strings.Repeat("=", 40))
	fmt.Println()

	// Detect or use specified shell
	shellType := setupShellFlag
	if shellType == "" {
		shellType = detectShellEnvironment()
	} else {
		shellType = strings.ToLower(shellType)
	}

	// Validate shell type
	if !isValidShell(shellType) {
		fmt.Println(red("Error:"), "Unsupported shell type:", shellType)
		fmt.Println("Supported shells: zsh, bash, fish, nix")
		os.Exit(1)
	}

	fmt.Printf("Detected shell: %s\n", green(shellType))

	// Get config file path
	configPath, err := getShellConfigPath(shellType)
	if err != nil {
		fmt.Println(red("Error:"), err)
		os.Exit(1)
	}

	fmt.Printf("Config file: %s\n", cyan(configPath))
	fmt.Println()

	// Check if aliases already exist
	aliasesExist, err := checkAliasesExist(configPath, shellType)
	if err != nil && !os.IsNotExist(err) {
		fmt.Println(red("Error checking config file:"), err)
		os.Exit(1)
	}

	if aliasesExist && !setupForce {
		fmt.Println(yellow("Radas aliases already exist in your config file."))
		fmt.Println("Use --force to overwrite existing aliases.")
		return
	}

	// Generate aliases content
	aliasesContent := generateAliasesContent(shellType)

	if setupDryRun {
		fmt.Println(yellow("Dry run mode - showing what would be added:"))
		fmt.Println()
		fmt.Println(aliasesContent)
		return
	}

	// Confirm with user
	var proceed bool
	prompt := &survey.Confirm{
		Message: fmt.Sprintf("Add Radas aliases to %s?", configPath),
		Default: true,
	}
	survey.AskOne(prompt, &proceed)

	if !proceed {
		fmt.Println(yellow("Setup cancelled."))
		return
	}

	// Backup existing config
	if err := backupConfig(configPath); err != nil {
		fmt.Println(yellow("Warning: Could not create backup:"), err)
	}

	// Remove existing aliases if force flag is set
	if aliasesExist && setupForce {
		if err := removeExistingAliases(configPath, shellType); err != nil {
			fmt.Println(red("Error removing existing aliases:"), err)
			os.Exit(1)
		}
		fmt.Println(yellow("Removed existing Radas aliases."))
	}

	// Write aliases to config
	if err := writeAliasesToConfig(configPath, aliasesContent, shellType); err != nil {
		fmt.Println(red("Error writing aliases:"), err)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println(green("Setup completed successfully!"))
	fmt.Println()

	// Print reload instructions
	printReloadInstructions(shellType, configPath)
}

// detectShellEnvironment detects the current shell environment
func detectShellEnvironment() string {
	// Check for Nix environment first
	if isNixEnvironment() {
		return ShellNix
	}

	// Check SHELL environment variable
	shell := os.Getenv("SHELL")
	if shell == "" {
		return ShellZsh // Default
	}

	shellName := filepath.Base(shell)
	switch shellName {
	case "zsh":
		return ShellZsh
	case "bash":
		return ShellBash
	case "fish":
		return ShellFish
	default:
		return ShellZsh
	}
}

// isNixEnvironment checks if running in a Nix environment
func isNixEnvironment() bool {
	// Check for Nix-specific environment variables
	nixIndicators := []string{
		"IN_NIX_SHELL",
		"NIX_PATH",
		"NIX_PROFILES",
		"NIX_SSL_CERT_FILE",
	}

	for _, indicator := range nixIndicators {
		if os.Getenv(indicator) != "" {
			return true
		}
	}

	// Check for home-manager
	homeDir, err := os.UserHomeDir()
	if err == nil {
		hmPath := filepath.Join(homeDir, ".config", "home-manager", "home.nix")
		if _, err := os.Stat(hmPath); err == nil {
			return true
		}
	}

	// Check for flake.nix or shell.nix in current directory
	if _, err := os.Stat("flake.nix"); err == nil {
		return true
	}
	if _, err := os.Stat("shell.nix"); err == nil {
		return true
	}

	return false
}

// isValidShell checks if the shell type is supported
func isValidShell(shell string) bool {
	switch shell {
	case ShellZsh, ShellBash, ShellFish, ShellNix:
		return true
	default:
		return false
	}
}

// getShellConfigPath returns the config file path for the shell
func getShellConfigPath(shellType string) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("could not determine home directory: %w", err)
	}

	switch shellType {
	case ShellZsh:
		return filepath.Join(homeDir, ".zshrc"), nil
	case ShellBash:
		return filepath.Join(homeDir, ".bashrc"), nil
	case ShellFish:
		return filepath.Join(homeDir, ".config", "fish", "config.fish"), nil
	case ShellNix:
		// Check for home-manager first
		hmPath := filepath.Join(homeDir, ".config", "home-manager", "home.nix")
		if _, err := os.Stat(hmPath); err == nil {
			return hmPath, nil
		}
		// Fall back to flake.nix in current directory
		if _, err := os.Stat("flake.nix"); err == nil {
			return "flake.nix", nil
		}
		// Fall back to shell.nix
		if _, err := os.Stat("shell.nix"); err == nil {
			return "shell.nix", nil
		}
		// Default to home-manager path
		return hmPath, nil
	default:
		return "", fmt.Errorf("unsupported shell: %s", shellType)
	}
}

// checkAliasesExist checks if Radas aliases already exist in the config
func checkAliasesExist(configPath, _ string) (bool, error) {
	file, err := os.Open(configPath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "# Radas CLI Aliases") ||
			strings.Contains(line, "radas.shellAliases") {
			return true, nil
		}
	}

	return false, scanner.Err()
}

// generateAliasesContent generates the aliases content for the shell
func generateAliasesContent(shellType string) string {
	var sb strings.Builder

	timestamp := time.Now().Format("2006-01-02 15:04:05")

	switch shellType {
	case ShellNix:
		sb.WriteString(generateNixAliases(timestamp))
	case ShellFish:
		sb.WriteString(generateFishAliases(timestamp))
	default: // zsh, bash
		sb.WriteString(generatePosixAliases(timestamp))
	}

	return sb.String()
}

// generatePosixAliases generates aliases for zsh/bash
func generatePosixAliases(timestamp string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("\n# Radas CLI Aliases (added %s)\n", timestamp))
	sb.WriteString("# https://github.com/raizora/radas\n")

	// Group aliases by category
	categories := getAliasCategories()

	for _, cat := range []string{"Git", "Frontend", "Backend", "DevOps", "Design", "Other"} {
		aliases := categories[cat]
		if len(aliases) == 0 {
			continue
		}

		sb.WriteString(fmt.Sprintf("\n# %s Commands\n", cat))
		for _, alias := range aliases {
			cmd := constants.CommandAliases[alias]
			sb.WriteString(fmt.Sprintf("alias %s='radas %s'\n", alias, cmd))
		}
	}

	sb.WriteString("# End Radas CLI Aliases\n")

	return sb.String()
}

// generateFishAliases generates aliases for fish shell
func generateFishAliases(timestamp string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("\n# Radas CLI Aliases (added %s)\n", timestamp))
	sb.WriteString("# https://github.com/raizora/radas\n")

	categories := getAliasCategories()

	for _, cat := range []string{"Git", "Frontend", "Backend", "DevOps", "Design", "Other"} {
		aliases := categories[cat]
		if len(aliases) == 0 {
			continue
		}

		sb.WriteString(fmt.Sprintf("\n# %s Commands\n", cat))
		for _, alias := range aliases {
			cmd := constants.CommandAliases[alias]
			sb.WriteString(fmt.Sprintf("alias %s 'radas %s'\n", alias, cmd))
		}
	}

	sb.WriteString("# End Radas CLI Aliases\n")

	return sb.String()
}

// generateNixAliases generates aliases for Nix home-manager
func generateNixAliases(timestamp string) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("\n  # Radas CLI Aliases (added %s)\n", timestamp))
	sb.WriteString("  # Add this to your home.nix programs.zsh.shellAliases or programs.bash.shellAliases\n")
	sb.WriteString("  # Or add to home.shellAliases for all shells\n")
	sb.WriteString("  radas.shellAliases = {\n")

	categories := getAliasCategories()

	for _, cat := range []string{"Git", "Frontend", "Backend", "DevOps", "Design", "Other"} {
		aliases := categories[cat]
		if len(aliases) == 0 {
			continue
		}

		sb.WriteString(fmt.Sprintf("    # %s Commands\n", cat))
		for _, alias := range aliases {
			cmd := constants.CommandAliases[alias]
			sb.WriteString(fmt.Sprintf("    %s = \"radas %s\";\n", alias, cmd))
		}
	}

	sb.WriteString("  };\n")
	sb.WriteString("  # End Radas CLI Aliases\n")
	sb.WriteString("\n  # To use, add to your home.nix:\n")
	sb.WriteString("  # programs.zsh.shellAliases = config.radas.shellAliases;\n")
	sb.WriteString("  # Or: home.shellAliases = config.radas.shellAliases;\n")

	return sb.String()
}

// getAliasCategories returns aliases grouped by category
func getAliasCategories() map[string][]string {
	categories := map[string][]string{
		"Git":      {},
		"Frontend": {},
		"Backend":  {},
		"DevOps":   {},
		"Design":   {},
		"Other":    {},
	}

	for alias := range constants.CommandAliases {
		switch {
		case strings.HasPrefix(alias, "rf"):
			categories["Frontend"] = append(categories["Frontend"], alias)
		case strings.HasPrefix(alias, "rb") && alias != "rrb":
			categories["Backend"] = append(categories["Backend"], alias)
		case strings.HasPrefix(alias, "rdd"):
			categories["DevOps"] = append(categories["DevOps"], alias)
		case strings.HasPrefix(alias, "rds"):
			categories["Design"] = append(categories["Design"], alias)
		case strings.HasPrefix(alias, "rc") && alias != "rcf",
			strings.HasPrefix(alias, "rp"),
			strings.HasPrefix(alias, "rl"),
			alias == "rdb",
			alias == "rjp":
			categories["Git"] = append(categories["Git"], alias)
		default:
			categories["Other"] = append(categories["Other"], alias)
		}
	}

	return categories
}

// backupConfig creates a backup of the config file
func backupConfig(configPath string) error {
	// Check if file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return nil // No need to backup non-existent file
	}

	backupPath := configPath + ".bak." + time.Now().Format("20060102-150405")

	input, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}

	err = os.WriteFile(backupPath, input, 0644)
	if err != nil {
		return err
	}

	fmt.Printf("Backup created: %s\n", backupPath)
	return nil
}

// removeExistingAliases removes existing Radas aliases from the config
func removeExistingAliases(configPath, _ string) error {
	input, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}

	lines := strings.Split(string(input), "\n")
	var newLines []string
	inRadasBlock := false

	for _, line := range lines {
		// Detect start of Radas block
		if strings.Contains(line, "# Radas CLI Aliases") ||
			strings.Contains(line, "radas.shellAliases") {
			inRadasBlock = true
			continue
		}

		// Detect end of Radas block
		if inRadasBlock && strings.Contains(line, "# End Radas CLI Aliases") {
			inRadasBlock = false
			continue
		}

		// Skip lines inside Radas block
		if inRadasBlock {
			continue
		}

		newLines = append(newLines, line)
	}

	return os.WriteFile(configPath, []byte(strings.Join(newLines, "\n")), 0644)
}

// writeAliasesToConfig appends aliases to the config file
func writeAliasesToConfig(configPath, content, _ string) error {
	// Ensure directory exists
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("could not create directory: %w", err)
	}

	// Open file in append mode, create if not exists
	file, err := os.OpenFile(configPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("could not open config file: %w", err)
	}
	defer file.Close()

	if _, err := file.WriteString(content); err != nil {
		return fmt.Errorf("could not write aliases: %w", err)
	}

	return nil
}

// printReloadInstructions prints instructions to reload the shell config
func printReloadInstructions(shellType, _ string) {
	cyan := color.New(color.FgCyan).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()

	fmt.Println(yellow("To apply changes, run:"))
	fmt.Println()

	switch shellType {
	case ShellZsh:
		fmt.Printf("  %s\n", cyan("source ~/.zshrc"))
	case ShellBash:
		fmt.Printf("  %s\n", cyan("source ~/.bashrc"))
	case ShellFish:
		fmt.Printf("  %s\n", cyan("source ~/.config/fish/config.fish"))
	case ShellNix:
		fmt.Println(cyan("  For home-manager:"))
		fmt.Println("    1. Add the aliases to your home.nix")
		fmt.Println("    2. Run: home-manager switch")
		fmt.Println()
		fmt.Println(cyan("  For nix-shell/nix develop:"))
		fmt.Println("    1. Add shellAliases to your shell.nix or flake.nix")
		fmt.Println("    2. Re-enter the shell")
	}

	fmt.Println()
	fmt.Println("Or open a new terminal window.")
	fmt.Println()
	fmt.Println("Try running:", cyan("rfd"), "(alias for 'radas fe doctor')")
}
