package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/constants"
	"github.com/raizora/radas/v4/internal/utils"
)

var (
	flagOriginOnly bool
	flagAllType bool
	flagAllOrigin bool
)

var DelBranchCmd = &cobra.Command{
	Use:   "del-branch [branch-name]",
	Short: "Delete local and/or origin branches.",
	Run: func(cmd *cobra.Command, args []string) {
		if flagAllType || flagAllOrigin || flagOriginOnly {
			if err := utils.CheckNetwork(); err != nil {
				fmt.Println(err)
				os.Exit(1)
			}
		}
		
		if flagAllType {
			// Delete all local and all origin branches except current
			fmt.Println("🌪️ Bip bop! Mengaktifkan mode sapu jagat...")
			deleteAllLocalBranches()
			deleteAllOriginBranches()
			fmt.Println("✨ Bip bop! Semua branch udah rata sama tanah!")
			return
		}
		if flagAllOrigin {
			fmt.Println("🌪️ Bip bop! Mengaktifkan mode sapu jagat (origin only)...")
			deleteAllOriginBranches()
			fmt.Println("✨ Bip bop! Semua origin branch udah rata sama tanah!")
			return
		}
		protected := constants.ProtectedBranches
		if len(args) == 0 {
			fmt.Fprintln(os.Stderr, "Please specify a branch name or use --all-type/--all-origin.")
			fmt.Fprintln(os.Stderr, "Available branches:")
			listBranches()
			os.Exit(1)
		}
		branch := args[0]
		if protected[branch] {
			fmt.Fprintf(os.Stderr, "Refusing to delete protected branch: %s\n", branch)
			os.Exit(1)
		}
		if !branchExists(branch) {
			fmt.Fprintf(os.Stderr, "Branch '%s' not found.\n", branch)
			fmt.Fprintln(os.Stderr, "Available branches:")
			listBranches()
			os.Exit(1)
		}
		if flagOriginOnly {
			deleteLocalBranch(branch)
			deleteOriginBranch(branch)
		} else {
			deleteLocalBranch(branch)
		}
	},
}

func deleteLocalBranch(branch string) {
	cmd := exec.Command("git", "branch", "-D", branch)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to delete local branch %s: %v\n", branch, err)
	}
}

func deleteOriginBranch(branch string) {
	spin := utils.NewSpinner("🔥 Bip bop! Lagi bakar hangus branch origin/" + branch + "...")
	spin.Start()
	
	cmd := exec.Command("git", "push", "origin", "--delete", branch)
	output, err := cmd.CombinedOutput()
	
	spin.Stop()
	
	if err != nil {
		outStr := string(output)
		if strings.Contains(outStr, "remote ref does not exist") {
			fmt.Fprintf(os.Stderr, "[warn] Origin branch '%s' emang udah ga ada di remote ngab.\n", branch)
		} else {
			fmt.Fprintf(os.Stderr, "Gagal bakar origin branch %s: %v\n%s\n", branch, err, outStr)
		}
	} else {
		fmt.Printf("🔥 Bip bop! Origin branch '%s' resmi jadi abu!\n", branch)
	}
}

func deleteAllLocalBranches() {
	protected := constants.ProtectedBranches
	// Get current branch
	curOut, _ := exec.Command("git", "branch", "--show-current").Output()
	current := strings.TrimSpace(string(curOut))
	// Get all local branches except current and protected
	out, _ := exec.Command("git", "branch").Output()
	for _, line := range strings.Split(string(out), "\n") {
		branch := strings.TrimSpace(strings.TrimPrefix(line, "*"))
		if branch != "" && branch != current && !protected[branch] {
			deleteLocalBranch(branch)
		}
	}
}

func deleteAllOriginBranches() {
	protected := constants.ProtectedBranches
	out, _ := exec.Command("git", "branch", "-r").Output()
	for _, line := range strings.Split(string(out), "\n") {
		remote := strings.TrimSpace(line)
		if strings.HasPrefix(remote, "origin/") && !strings.Contains(remote, "->") {
			branch := strings.TrimPrefix(remote, "origin/")
			if protected[branch] {
				continue
			}
			deleteOriginBranch(branch)
		}
	}
}

func branchExists(branch string) bool {
	out, _ := exec.Command("git", "branch").Output()
	for _, line := range strings.Split(string(out), "\n") {
		b := strings.TrimSpace(strings.TrimPrefix(line, "*"))
		if b == branch {
			return true
		}
	}
	return false
}

func listBranches() {
	out, _ := exec.Command("git", "branch").Output()
	for _, line := range strings.Split(string(out), "\n") {
		b := strings.TrimSpace(strings.TrimPrefix(line, "*"))
		if b != "" {
			fmt.Println("  ", b)
		}
	}
}

func init() {
	DelBranchCmd.Flags().BoolVarP(&flagOriginOnly, "origin", "o", false, "Delete both local and origin branch")
	DelBranchCmd.Flags().BoolVar(&flagAllType, "all-type", false, "Delete all local and all origin branches")
	DelBranchCmd.Flags().BoolVar(&flagAllOrigin, "all-origin", false, "Delete all origin branches")
	// Register in your root command
}
