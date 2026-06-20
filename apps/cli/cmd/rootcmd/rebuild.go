package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
)

var RebuildCmd = &cobra.Command{
	Use:   "rebuild",
	Short: "Rebuild radas CLI from source using scripts/build.sh",
	Run: func(cmd *cobra.Command, args []string) {
		sourcePath := os.Getenv("RADAS_SOURCE")
		if sourcePath == "" {
			fmt.Println("RADAS_SOURCE environment variable is not set.")
			fmt.Println("Set it to the radas repo root, e.g.: export RADAS_SOURCE=$HOME/code/radas")
			os.Exit(1)
		}

		scriptPath := filepath.Join(sourcePath, "apps", "cli", "scripts", "build.sh")
		if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
			fmt.Printf("Build script not found: %s\n", scriptPath)
			os.Exit(1)
		}

		cmdExec := exec.Command("bash", scriptPath)
		cmdExec.Stdout = os.Stdout
		cmdExec.Stderr = os.Stderr
		cmdExec.Stdin = os.Stdin
		cmdExec.Dir = filepath.Join(sourcePath, "apps", "cli")
		fmt.Printf("Running %s...\n", scriptPath)
		if err := cmdExec.Run(); err != nil {
			fmt.Printf("Build failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Build completed successfully!")
	},
}
