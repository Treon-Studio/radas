package rootcmd

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/spf13/cobra"
	
	"radas/constants"
)

// Shell flag for aliases command
var shellFlag string

// AliasesCmd represents the aliases command
var AliasesCmd = &cobra.Command{
	Use:   "aliases",
	Short: "Show all available command aliases",
	Long: `Display all shorthand command aliases available in Radas CLI.
These aliases can be used instead of the full commands to save typing.

You can specify a shell with the --shell flag:
  radas aliases --shell=fish    # Show aliases for fish shell
  radas aliases --shell=zsh     # Show aliases for zsh shell
  radas aliases --shell=bash    # Show aliases for bash shell`,
	Run: runAliases,
}

func init() {
	// Add shell flag to specify which shell to generate aliases for
	AliasesCmd.Flags().StringVarP(&shellFlag, "shell", "s", "", "Specify shell type (zsh, fish, bash)")
}

func runAliases(cmd *cobra.Command, args []string) {
	// Get shell type from flag or detect it
	var shellType string
	if shellFlag != "" {
		// Use the provided shell flag
		shellType = validateShellType(shellFlag)
	} else {
		// Auto-detect shell
		shellType = detectShell()
	}
	
	fmt.Println(constants.RadasASCIIArt)
	fmt.Printf("Setting up Radas aliases for %s\n", shellType)
	fmt.Println("==================================")
	fmt.Println()
	
	// Print instructions based on shell type
	printShellInstructions(shellType)
	
	// Get all the keys (aliases) from the map and sort them
	aliases := make([]string, 0, len(constants.CommandAliases))
	for alias := range constants.CommandAliases {
		aliases = append(aliases, alias)
	}
	sort.Strings(aliases)
	
	// Display aliases by category
	categories := map[string][]string{
		"Git Commands":      {},
		"Frontend Commands": {},
		"Backend Commands":  {},
		"DevOps Commands":   {},
		"Design Commands":   {},
		"Other Commands":    {},
	}
	
	// Categorize aliases based on their prefix
	for _, alias := range aliases {
		// Use the prefix of the alias to determine its category
		switch {
		case strings.HasPrefix(alias, "rf"):
			categories["Frontend Commands"] = append(categories["Frontend Commands"], alias)
		case strings.HasPrefix(alias, "rb"):
			categories["Backend Commands"] = append(categories["Backend Commands"], alias)
		case strings.HasPrefix(alias, "rdd"):
			categories["DevOps Commands"] = append(categories["DevOps Commands"], alias)
		case strings.HasPrefix(alias, "rds"):
			categories["Design Commands"] = append(categories["Design Commands"], alias)
		case strings.HasPrefix(alias, "rc") && alias != "rcf" || 
			 strings.HasPrefix(alias, "rp") || 
			 strings.HasPrefix(alias, "rl") ||
			 strings.HasPrefix(alias, "rd") && alias == "rdb" ||
			 alias == "rjp":
			categories["Git Commands"] = append(categories["Git Commands"], alias)
		default:
			categories["Other Commands"] = append(categories["Other Commands"], alias)
		}
	}
	
	// Print each category with shell-specific syntax
	for category, categoryAliases := range categories {
		if len(categoryAliases) == 0 {
			continue
		}
		
		fmt.Printf("# %s\n", category)
		fmt.Println()
		
		for _, alias := range categoryAliases {
			printAliasCommand(shellType, alias, constants.CommandAliases[alias])
		}
		fmt.Println()
	}
	
	// Print the commands to save aliases based on shell type
	printSaveInstructions(shellType)
}

// validateShellType ensures the provided shell type is valid
func validateShellType(shell string) string {
	// Normalize to lowercase
	shell = strings.ToLower(shell)
	
	// Check if it's a supported shell
	switch shell {
	case "zsh", "fish", "bash":
		return shell
	default:
		// Return zsh as default for unsupported shells
		fmt.Printf("Warning: Unsupported shell '%s'. Using zsh instead.\n\n", shell)
		return "zsh"
	}
}

// detectShell determines which shell the user is currently using
func detectShell() string {
	// Try to get the shell from the SHELL environment variable
	shell := os.Getenv("SHELL")
	
	// Default to zsh if we can't determine
	if shell == "" {
		return "zsh"
	}
	
	// Extract the shell name from the path
	shellParts := strings.Split(shell, "/")
	shellName := shellParts[len(shellParts)-1]
	
	// Check if it's a known shell
	switch shellName {
	case "zsh":
		return "zsh"
	case "fish":
		return "fish"
	case "bash":
		return "bash"
	default:
		// Default to zsh if we don't recognize the shell
		return "zsh"
	}
}

// printShellInstructions prints shell-specific instructions
func printShellInstructions(shellType string) {
	switch shellType {
	case "fish":
		fmt.Println("Copy these commands to your ~/.config/fish/config.fish file:")
		fmt.Println("Or you can copy and paste these directly into your terminal.")
	case "bash":
		fmt.Println("Copy these commands to your ~/.bashrc file:")
		fmt.Println("Then run 'source ~/.bashrc' to apply the changes.")
	default: // zsh
		fmt.Println("Copy these commands to your ~/.zshrc file:")
		fmt.Println("Then run 'source ~/.zshrc' to apply the changes.")
	}
	fmt.Println()
}

// printAliasCommand prints the command to define an alias in the specified shell
func printAliasCommand(shellType, alias, command string) {
	switch shellType {
	case "fish":
		fmt.Printf("  alias %s='radas %s'\n", alias, command)
	case "bash", "zsh":
		fmt.Printf("  alias %s='radas %s'\n", alias, command)
	}
}

// printSaveInstructions prints instructions on how to save aliases
func printSaveInstructions(shellType string) {
	switch shellType {
	case "fish":
		fmt.Println("You can save these aliases by running:")
		fmt.Println("  funcsave alias  # This saves all defined aliases")
		fmt.Println()  
	case "bash":
		fmt.Println("After adding to ~/.bashrc, run this command to apply changes:")
		fmt.Println("  source ~/.bashrc")
		fmt.Println()  
	default: // zsh
		fmt.Println("After adding to ~/.zshrc, run this command to apply changes:")
		fmt.Println("  source ~/.zshrc")
		fmt.Println()  
	}
	fmt.Println("To use an alias, simply type it instead of the full command.")
	fmt.Println("Example: Instead of `radas fe doctor`, you can type `rfd`")
}
