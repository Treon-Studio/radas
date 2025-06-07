package rootcmd

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"github.com/spf13/cobra"
)

var PullCmd = &cobra.Command{
	Use:   "pull",
	Short: "Alias for git pull origin <current-branch>",
	Run: func(cmd *cobra.Command, args []string) {
		branch := ""
		if len(args) > 0 {
			branch = args[0]
		} else {
			// detect current branch
			var out bytes.Buffer
			gitCmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
			gitCmd.Stdout = &out
			gitCmd.Stderr = os.Stderr
			if err := gitCmd.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to detect branch: %v\n", err)
				os.Exit(1)
			}
			branch = strings.TrimSpace(out.String())
		}
		pullCmd := exec.Command("git", "pull", "origin", branch)
		pullCmd.Stdout = os.Stdout
		pullCmd.Stderr = os.Stderr
		if err := pullCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "git pull failed: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	// Register in your root command
}
