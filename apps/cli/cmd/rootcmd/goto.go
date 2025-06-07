package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/spf13/cobra"
)

var GotoCmd = &cobra.Command{
	Use:   "goto <alias>",
	Short: "Go to a registered directory alias (source/working)",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		alias := args[0]
		var target string
		switch alias {
		case "source":
			target = os.Getenv("RADAS_SOURCE")
		case "working":
			target = os.Getenv("RADAS_PLAYGROUND")
		default:
			fmt.Printf("Unknown alias: %s\n", alias)
			os.Exit(1)
		}
		if target == "" {
			fmt.Printf("Environment variable for alias '%s' is not set.\n", alias)
			os.Exit(1)
		}
		// Open folder in file explorer
		var openCmd *exec.Cmd
		switch runtime.GOOS {
		case "darwin":
			openCmd = exec.Command("open", target)
		case "linux":
			openCmd = exec.Command("xdg-open", target)
		case "windows":
			openCmd = exec.Command("explorer", target)
		default:
			fmt.Println("Unsupported OS")
			os.Exit(1)
		}
		if err := openCmd.Start(); err != nil {
			fmt.Printf("Failed to open directory: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Opened %s (%s)\n", alias, target)
	},
}

func init() {
	// Register in root.go if needed
}
