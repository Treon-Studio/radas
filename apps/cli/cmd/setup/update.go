package setup

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/rhysd/go-github-selfupdate/selfupdate"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/netgate"
	"github.com/raizora/radas/v4/internal/utils"
)

var buildFromSource bool

var UpdateCmd = &cobra.Command{
	Use:     "update",
	Short:   "Update radas CLI to the latest version from GitHub Releases, or rebuild from source with --build-from-source",
	PreRunE: netgate.RequireNetwork("Pembaruan RADAS CLI"),
	Run: func(cmd *cobra.Command, args []string) {
		if err := utils.CheckNetwork(); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}

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
			cmdExec.Stderr = os.Stderr
			cmdExec.Stdin = os.Stdin
			cmdExec.Dir = sourcePath

			spin := utils.NewSpinner("🛠️ Bip bop! Lagi meracik radas dari bumbu rahasia (source)... sabar ngab!")
			spin.Start()

			err := cmdExec.Run()
			spin.Stop()

			if err != nil {
				fmt.Printf("Build and install failed: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("✨ Bip bop! Radas racikan baru udah mateng dan siap saji!")
			return
		}

		const repo = "raizora/radas"

		spin := utils.NewSpinner("🚀 Bip bop! Menerawang versi terbaru dari angkasa GitHub...")
		spin.Start()

		latest, found, err := selfupdate.DetectLatest(repo)

		spin.Stop()

		if err != nil {
			err = netgate.WrapError("Pembaruan RADAS CLI", err)
			fmt.Println("Error occurred while detecting version:", err)
			os.Exit(1)
		}
		current := constants.Version
		if !found || latest.Version.String() == current {
			fmt.Println("😎 Bip bop! CLI kamu udah paling gaul bin kekinian di versi " + current + "!")
			return
		}

		fmt.Printf("Mendaratkan versi %s ke bumi...\n", latest.Version)
		exe, err := os.Executable()
		if err != nil {
			fmt.Println("Could not locate executable path:", err)
			os.Exit(1)
		}

		spinDown := utils.NewSpinner("🛸 Bip bop! Menyedot data update dari dimensi lain...")
		spinDown.Start()

		err = selfupdate.UpdateTo(latest.AssetURL, exe)

		spinDown.Stop()

		if err != nil {
			err = netgate.WrapError("Pembaruan RADAS CLI", err)
			fmt.Println("Update failed:", err)
			os.Exit(1)
		}
		fmt.Println("🎉 Voila! Radas kamu sukses berevolusi ke versi", latest.Version, "!")
	},
}

func init() {
	UpdateCmd.Flags().BoolVar(&buildFromSource, "build-from-source", false, "Rebuild radas CLI from scripts/build_and_install.sh in RADAS_SOURCE")
}