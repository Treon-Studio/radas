package rootcmd

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"github.com/spf13/cobra"
)

var PushCmd = &cobra.Command{
	Use:   "push",
	Short: "Alias for git push origin <current-branch>",
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
		pushCmd := exec.Command("git", "push", "origin", branch)
		pushCmd.Stdout = os.Stdout
		pushCmd.Stderr = os.Stderr
		if err := pushCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "git push failed: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	// Register in your root command
}
