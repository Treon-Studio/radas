package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"github.com/spf13/cobra"
)

var CommitCmd = &cobra.Command{
	Use:   "commit [files]",
	Short: "Alias for git add [files] && cz commit",
	Args:  cobra.ArbitraryArgs,
	Run: func(cmd *cobra.Command, args []string) {
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
		czCmd := exec.Command("cz", "commit")
		czCmd.Stdout = os.Stdout
		czCmd.Stderr = os.Stderr
		czCmd.Stdin = os.Stdin
		if err := czCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "cz commit failed: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	// Register in your root command
}
