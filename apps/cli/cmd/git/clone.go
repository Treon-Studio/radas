package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/utils"
)

var CloneCmd = &cobra.Command{
	Use:   "clone <repo-url>",
	Short: "Clone a git repository and enter the project directory",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if err := utils.CheckNetwork(); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}

		repoURL := args[0]
		
		// Determine the directory name (same as git clone behavior)
		baseName := repoURL
		if strings.HasSuffix(baseName, ".git") {
			baseName = baseName[:len(baseName)-4]
		}
		baseName = filepath.Base(baseName)

		cloneCmd := exec.Command("git", "clone", repoURL)
		cloneCmd.Stderr = os.Stderr
		
		spin := utils.NewSpinner("🛸 Bip bop! Lagi nyedot kode-kode sakti dari " + repoURL + "...")
		spin.Start()
		
		err := cloneCmd.Run()
		
		spin.Stop()
		
		if err != nil {
			fmt.Fprintf(os.Stderr, "😵 Bip bop! Waduh nyedotnya gagal ngab: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("\n✨ Bip bop! Sukses mendarat! Langsung teleport ke direktori: %s\n", baseName)
		// Change working directory to the cloned project
		err = os.Chdir(baseName)
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
