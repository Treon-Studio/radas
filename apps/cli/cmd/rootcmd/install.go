package rootcmd

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"
)

// InstallCmd represents the install command
var InstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install the CLI to your system PATH",
	Long:  `Install the CLI binary to your system's PATH so you can run it from anywhere.`,
	Run: func(cmd *cobra.Command, args []string) {
		runSystemInstall()
	},
}

func runSystemInstall() {
	// Check if install script exists
	scriptPath := "scripts/install.sh"
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		fmt.Println("Error: Installation script not found.")
		fmt.Println("Make sure you are running this command from the project root directory.")
		return
	}

	// Run the install script
	fmt.Println("Installing CLI to system PATH...")
	installCmd := exec.Command("/bin/bash", scriptPath)
	installCmd.Stdout = os.Stdout
	installCmd.Stderr = os.Stderr
	
	err := installCmd.Run()
	if err != nil {
		fmt.Printf("Installation failed: %v\n", err)
		return
	}
} 