package git

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/netgate"
	"github.com/raizora/radas/v4/internal/utils"
)

var JustPushCmd = &cobra.Command{
	Use:     "just-push [files]",
	Short:   "Add, commit, and push changes in one step",
	Args:    cobra.ArbitraryArgs,
	PreRunE: netgate.RequireNetwork("Git Just Push"),
	Run: func(cmd *cobra.Command, args []string) {
		// 1. git add [files] if provided, default to '.' if not
		addArgs := []string{"add"}
		if len(args) > 0 {
			addArgs = append(addArgs, args...)
		} else {
			addArgs = append(addArgs, ".")
		}
		gitAdd := exec.Command("git", addArgs...)
		gitAdd.Stdout = os.Stdout
		gitAdd.Stderr = os.Stderr
		if err := gitAdd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "git add failed: %v\n", err)
			os.Exit(1)
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
		pushCmd.Stderr = os.Stderr
		
		spin := utils.NewSpinner("🚀 Bip bop! Menembakkan kodemu ke orbit origin/" + branch + "...")
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
