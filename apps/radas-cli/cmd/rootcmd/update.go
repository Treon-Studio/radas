package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"github.com/spf13/cobra"
	"github.com/rhysd/go-github-selfupdate/selfupdate"
	"radas/constants"
)

var buildFromSource bool

var UpdateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update radas CLI to the latest version from GitHub Releases, or rebuild from source with --build-from-source",
	Run: func(cmd *cobra.Command, args []string) {
		if buildFromSource {
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
			return
		}
		const repo = "raizora/radas"
		fmt.Println("Checking for updates...")
		latest, found, err := selfupdate.DetectLatest(repo)
		if err != nil {
			fmt.Println("Error occurred while detecting version:", err)
			os.Exit(1)
		}
		current := constants.Version
		if !found || latest.Version.String() == current {
			fmt.Println("Current version is the latest.")
			return
		}
		fmt.Printf("Updating to version %s...\n", latest.Version)
		exe, err := os.Executable()
		if err != nil {
			fmt.Println("Could not locate executable path:", err)
			os.Exit(1)
		}
		err = selfupdate.UpdateTo(latest.AssetURL, exe)
		if err != nil {
			fmt.Println("Update failed:", err)
			os.Exit(1)
		}
		fmt.Println("Successfully updated to version", latest.Version)
	},
}

func init() {
	UpdateCmd.Flags().BoolVar(&buildFromSource, "build-from-source", false, "Rebuild radas CLI from scripts/build_and_install.sh in RADAS_SOURCE")
}


func init() {
	// No flags for now
}