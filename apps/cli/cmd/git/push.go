package git

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/utils"
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
		if err := utils.CheckNetwork(); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}

		pushCmd := exec.Command("git", "push", "origin", branch)
		pushCmd.Stderr = os.Stderr
		
		spin := utils.NewSpinner("🚀 Bip bop! Menerbangkan kodemu ke awan-awan origin/" + branch + "...")
		spin.Start()
		
		err := pushCmd.Run()
		
		spin.Stop()
		
		if err != nil {
			fmt.Fprintf(os.Stderr, "😵 Bip bop! Waduh roketnya meledak pas push ngab: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("🌟 Bip bop! Kodemu sukses nangkring di angkasa GitHub!")
	},
}

func init() {
	// Register in your root command
}
