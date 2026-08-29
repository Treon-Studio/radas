package git

import (
	"bytes"
	"fmt"
	"github.com/spf13/cobra"
	"os"
	"os/exec"
	"strings"

	"github.com/raizora/radas/v4/internal/netgate"
	"github.com/raizora/radas/v4/internal/utils"
)

var PullCmd = &cobra.Command{
	Use:     "pull",
	Short:   "Alias for git pull origin <current-branch>",
	PreRunE: netgate.RequireNetwork("Git Pull"),
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
		pullCmd.Stderr = os.Stderr

		spin := utils.NewSpinner("🎣 Bip bop! Lagi narik kode-kode seger dari origin/" + branch + "...")
		spin.Start()

		err := pullCmd.Run()

		spin.Stop()

		if err != nil {
			fmt.Fprintf(os.Stderr, "😵 Bip bop! Waduh tarikannya putus ngab: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("✨ Bip bop! Kode lokal kamu udah up-to-date dan siap diajak gaul!")
	},
}

func init() {
	// Register in your root command
}
