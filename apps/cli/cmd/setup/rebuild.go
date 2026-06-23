package setup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/utils"
)

var RebuildCmd = &cobra.Command{
	Use:   "rebuild",
	Short: "Rebuild radas CLI from source and install to /usr/local/bin",
	Run: func(cmd *cobra.Command, args []string) {
		sourcePath := os.Getenv("RADAS_SOURCE")
		if sourcePath == "" {
			cwd, err := os.Getwd()
			if err == nil {
				for cwd != "/" && cwd != "." {
					if _, err := os.Stat(filepath.Join(cwd, "apps", "cli", "scripts", "build_and_install.sh")); err == nil {
						sourcePath = cwd
						break
					}
					if _, err := os.Stat(filepath.Join(cwd, "scripts", "build_and_install.sh")); err == nil {
						sourcePath = filepath.Dir(filepath.Dir(cwd))
						break
					}
					cwd = filepath.Dir(cwd)
				}
			}
			if sourcePath == "" {
				fmt.Println("RADAS_SOURCE environment variable is not set and could not auto-detect radas repository.")
				fmt.Println("Set it to the radas repo root, e.g.: export RADAS_SOURCE=$HOME/code/radas")
				os.Exit(1)
			}
		}

		// Auto-correct if RADAS_SOURCE was set to apps/cli instead of repo root
		if filepath.Base(sourcePath) == "cli" && filepath.Base(filepath.Dir(sourcePath)) == "apps" {
			sourcePath = filepath.Dir(filepath.Dir(sourcePath))
		}

		scriptPath := filepath.Join(sourcePath, "apps", "cli", "scripts", "build_and_install.sh")
		if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
			fmt.Printf("Build script not found: %s\n", scriptPath)
			os.Exit(1)
		}

		cmdExec := exec.Command("bash", scriptPath)
		// Hide Stdout to let the spinner shine, but keep Stderr
		cmdExec.Stderr = os.Stderr
		cmdExec.Stdin = os.Stdin
		cmdExec.Dir = filepath.Join(sourcePath, "apps", "cli")
		
		spin := utils.NewSpinner("🛠️ Bip bop! Rebuild & auto-install jalan... Siap-siap ketik password Mac kamu ya ngab!")
		spin.Start()
		
		err := cmdExec.Run()
		
		spin.Stop()
		
		if err != nil {
			fmt.Printf("Build failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Build completed successfully!")
	},
}
