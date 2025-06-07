package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"github.com/spf13/cobra"
)

var RebuildCmd = &cobra.Command{
	Use:   "rebuild",
	Short: "Rebuild radas CLI from source (scripts/build_and_install.sh)",
	Run: func(cmd *cobra.Command, args []string) {
		sourcePath := os.Getenv("RADAS_SOURCE")
		if sourcePath == "" {
			fmt.Println("RADAS_SOURCE environment variable is not set.")
			os.Exit(1)
		}
		scriptPath := sourcePath + "/scripts/build_and_install.sh"
		if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
			fmt.Printf("Script not found: %s\n", scriptPath)
			os.Exit(1)
		}
		cmdExec := exec.Command("bash", scriptPath)
		cmdExec.Stdout = os.Stdout
		cmdExec.Stderr = os.Stderr
		cmdExec.Stdin = os.Stdin
		cmdExec.Dir = sourcePath
		fmt.Printf("Running %s...\n", scriptPath)
		if err := cmdExec.Run(); err != nil {
			fmt.Printf("Build and install failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Build and install completed successfully!")
	},
}
