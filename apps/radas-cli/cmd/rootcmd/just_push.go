package rootcmd

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"github.com/spf13/cobra"
)

var JustPushCmd = &cobra.Command{
	Use:   "just-push [files]",
	Short: "Add, commit, and push changes in one step",
	Args:  cobra.ArbitraryArgs,
	Run: func(cmd *cobra.Command, args []string) {
		// 1. git add [files] if provided
		if len(args) > 0 {
			addArgs := append([]string{"add"}, args...)
			gitAdd := exec.Command("git", addArgs...)
			gitAdd.Stdout = os.Stdout
			gitAdd.Stderr = os.Stderr
			if err := gitAdd.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "git add failed: %v\n", err)
				os.Exit(1)
			}
		}

		// 2. cz commit (interactive)
		czCmd := exec.Command("cz", "commit")
		czCmd.Stdout = os.Stdout
		czCmd.Stderr = os.Stderr
		czCmd.Stdin = os.Stdin
		if err := czCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "cz commit failed: %v\n", err)
			os.Exit(1)
		}

		// 3. git push origin <current-branch>
		var out bytes.Buffer
		gitBranchCmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
		gitBranchCmd.Stdout = &out
		gitBranchCmd.Stderr = os.Stderr
		if err := gitBranchCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to detect branch: %v\n", err)
			os.Exit(1)
		}
		branch := strings.TrimSpace(out.String())

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
