package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
	"radas/constants"
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
		if flagAllType {
			// Delete all local and all origin branches except current
			deleteAllLocalBranches()
			deleteAllOriginBranches()
			return
		}
		if flagAllOrigin {
			deleteAllOriginBranches()
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
	cmd := exec.Command("git", "push", "origin", "--delete", branch)
	output, err := cmd.CombinedOutput()
	if err != nil {
		outStr := string(output)
		if strings.Contains(outStr, "remote ref does not exist") {
			fmt.Fprintf(os.Stderr, "[warn] Origin branch '%s' does not exist on remote.\n", branch)
		} else {
			fmt.Fprintf(os.Stderr, "Failed to delete origin branch %s: %v\n%s\n", branch, err, outStr)
		}
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
