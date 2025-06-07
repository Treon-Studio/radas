package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var CloneCmd = &cobra.Command{
	Use:   "clone <repo-url>",
	Short: "Clone a git repository and enter the project directory",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		repoURL := args[0]
		fmt.Printf("Cloning %s...\n", repoURL)

		// Determine the directory name (same as git clone behavior)
		baseName := repoURL
		if strings.HasSuffix(baseName, ".git") {
			baseName = baseName[:len(baseName)-4]
		}
		baseName = filepath.Base(baseName)

		cloneCmd := exec.Command("git", "clone", repoURL)
		cloneCmd.Stdout = os.Stdout
		cloneCmd.Stderr = os.Stderr
		if err := cloneCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to clone repository: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("\nSuccessfully cloned. Entering directory: %s\n", baseName)
		// Change working directory to the cloned project
		err := os.Chdir(baseName)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to enter directory %s: %v\n", baseName, err)
			os.Exit(1)
		}
		// Optionally, you can print the current directory
		cwd, _ := os.Getwd()
		fmt.Printf("You are now in: %s\n", cwd)
	},
}

func init() {
	// Register the clone command in your root command
}
