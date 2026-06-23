package setup

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/utils"
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
	fmt.Println("🔨 Bip bop! Menyiapkan peralatan pertukangan...")
	installCmd := exec.Command("/bin/bash", scriptPath)
	installCmd.Stderr = os.Stderr
	
	spin := utils.NewSpinner("🔨 Bip bop! Sedang menancapkan paku ajaib ke sistem PATH kamu...")
	spin.Start()
	
	err := installCmd.Run()
	
	spin.Stop()
	
	if err != nil {
		fmt.Printf("🔧 Bip bop! Waduh, obengnya meleset! Installation failed: %v\n", err)
		return
	}
	fmt.Println("🎉 Voila! Radas udah terpasang kuat di sistem kamu! Tinggal panggil aja dari mana pun!")
} 