package rootcmd

import (
	"fmt"
	"os"
	"os/user"
	"path/filepath"

	"github.com/spf13/cobra"
)

var DoctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check radas environment and config",
	Run: func(cmd *cobra.Command, args []string) {
		checkEnvVar("RADAS_SOURCE")
		checkEnvVar("RADAS_PLAYGROUND")
		checkConfigDir()
	},
}

func checkEnvVar(name string) {
	val := os.Getenv(name)
	if val == "" {
		fmt.Printf("[✗] %s is NOT set\n", name)
	} else {
		fmt.Printf("[✓] %s is set to: %s\n", name, val)
	}
}

func checkConfigDir() {
	usr, err := user.Current()
	if err != nil {
		fmt.Printf("[✗] Cannot determine current user: %v\n", err)
		return
	}
	configDir := filepath.Join(usr.HomeDir, ".config", "radas")
	info, err := os.Stat(configDir)
	if err != nil {
		fmt.Printf("[✗] %s does NOT exist\n", configDir)
		fmt.Print("Would you like to create it now? (y/N): ")
		var confirm string
		fmt.Scanln(&confirm)
		if confirm == "y" || confirm == "Y" {
			err := os.MkdirAll(configDir, 0755)
			if err != nil {
				fmt.Printf("[✗] Failed to create %s: %v\n", configDir, err)
				return
			}
			fmt.Printf("[✓] %s created successfully!\n", configDir)
		} else {
			fmt.Println("Skipped creating directory.")
		}
		return
	}
	if !info.IsDir() {
		fmt.Printf("[✗] %s exists but is NOT a directory\n", configDir)
		return
	}
	// Check write permission
	testFile := filepath.Join(configDir, ".doctor_write_test")
	err = os.WriteFile(testFile, []byte("test"), 0644)
	if err != nil {
		fmt.Printf("[✗] %s is NOT writable: %v\n", configDir, err)
		return
	}
	os.Remove(testFile)
	fmt.Printf("[✓] %s exists and is writable\n", configDir)
}

func init() {
	// Register in root.go if needed
}
