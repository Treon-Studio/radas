package rootcmd

import (
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

var CreateBranchCmd = &cobra.Command{
	Use:   "create-branch",
	Short: "Create new git branch with conventional name",
	Run: func(cmd *cobra.Command, args []string) {
		branchTypes := []string{"feature", "fix", "chore", "hotfix", "refactor", "test", "docs"}
		var btype string
		_ = survey.AskOne(&survey.Select{
			Message: "Branch type:",
			Options: branchTypes,
			Default: "feature",
		}, &btype)

		var scope string
		_ = survey.AskOne(&survey.Input{
			Message: "Scope (optional, e.g. auth, profile):",
		}, &scope)

		var desc string
		_ = survey.AskOne(&survey.Input{
			Message: "Description (e.g. add-login-page):",
		}, &desc, survey.WithValidator(survey.Required))

		// Normalize: lowercase, replace space with dash, remove invalid chars
		slug := func(s string) string {
			s = strings.ToLower(s)
			s = strings.ReplaceAll(s, " ", "-")
			re := regexp.MustCompile(`[^a-z0-9\-]`)
			return re.ReplaceAllString(s, "")
		}
		btype = slug(btype)
		scope = slug(scope)
		desc = slug(desc)

		branchName := btype
		if scope != "" {
			branchName += "/" + scope + "-" + desc
		} else {
			branchName += "/" + desc
		}

		cmdGit := exec.Command("git", "checkout", "-b", branchName)
		cmdGit.Stdout = os.Stdout
		cmdGit.Stderr = os.Stderr
		if err := cmdGit.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to create branch: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Switched to new branch '%s'\n", branchName)
	},
}

func init() {
	// Register in your root command
}
