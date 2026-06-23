package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var ReloadCmd = &cobra.Command{
	Use:   "reload",
	Short: "Output shell reload command (use with: eval \"$(radas reload)\")",
	Run: func(cmd *cobra.Command, args []string) {
		shell := filepath.Base(os.Getenv("SHELL"))
		home := os.Getenv("HOME")

		var configFile string
		switch shell {
		case "zsh":
			configFile = filepath.Join(home, ".zshrc")
		case "bash":
			configFile = filepath.Join(home, ".bashrc")
		case "fish":
			configFile = filepath.Join(home, ".config", "fish", "config.fish")
		default:
			configFile = filepath.Join(home, ".profile")
		}

		if shell == "fish" {
			fmt.Printf("source %s", configFile)
		} else {
			fmt.Printf("source %s", configFile)
		}
	},
}
