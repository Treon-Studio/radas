// Package git implements the `radas git` command group for Git workflow
// helpers. The individual commands were historically registered flat at the
// root level; they now live under `radas git` with deprecated root-level
// aliases so existing scripts keep working while help output stays focused.
package git

import (
	"fmt"

	"github.com/spf13/cobra"
)

// GitCmd is the parent group for the Git workflow helpers.
var GitCmd = &cobra.Command{
	Use:   "git",
	Short: "Git workflow helpers: commit, push, branches, clone",
	Long: `Git workflow helpers that wrap the common Git operations the Radas
team uses every day. Each subcommand adds guardrails (staged-file checks,
push confirmation) on top of plain git.

The equivalent root-level commands (radas commit, radas push, ...) are
deprecated aliases kept for backward compatibility.`,

	Example: `  # Commit staged files with a generated conventional message
  radas git commit

  # Push with confirmation
  radas git push

  # List, create, and delete branches
  radas git list-branch
  radas git create-branch
  radas git del-branch my-branch`,
}

func init() {
	GitCmd.AddCommand(CommitCmd)
	GitCmd.AddCommand(PushCmd)
	GitCmd.AddCommand(PullCmd)
	GitCmd.AddCommand(CloneCmd)
	GitCmd.AddCommand(CreateBranchCmd)
	GitCmd.AddCommand(ListBranchCmd)
	GitCmd.AddCommand(DelBranchCmd)
	GitCmd.AddCommand(JustPushCmd)
}

// DeprecatedAlias returns a root-level stub that forwards to a git
// subcommand. The copy shares Use/Short/RunE/PreRunE/Args with the original
// but is marked Deprecated so cobra prints a warning and help output steers
// users toward the grouped path. New flags added to the original command are
// not copied — deprecated aliases are frozen by design.
func DeprecatedAlias(original *cobra.Command) *cobra.Command {
	alias := &cobra.Command{
		Use:          original.Use,
		Short:        original.Short,
		Long:         original.Long,
		Args:         original.Args,
		RunE:         original.RunE,
		PreRunE:      original.PreRunE,
		Deprecated:   fmt.Sprintf("use %q instead", GitCmd.Name()+" "+original.Name()),
		SilenceUsage: true,
	}
	return alias
}
