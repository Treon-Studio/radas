package workspace

import "github.com/spf13/cobra"

var runCmd = &cobra.Command{
	Use:   "run <task>",
	Short: "Run a task with topological scheduling, parallel execution, and cache",
	Long: `Run a task across the workspace. Examples:

  radas workspace run test --project=api
  radas workspace run build --all
  radas workspace run test --affected --base=main
  radas workspace run build --no-cache`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error { return runRun(cmd, args) },
}

func init() {
	runCmd.Flags().String("project", "", "run task only in this project")
	runCmd.Flags().Bool("all", false, "run task in all projects that have it")
	runCmd.Flags().Bool("affected", false, "run task only in projects affected by changes")
	runCmd.Flags().String("base", "main", "base ref for affected detection (used with --affected)")
	runCmd.Flags().Bool("no-cache", false, "force re-execution, bypass cache")
	runCmd.Flags().Int("max-parallel", 4, "max parallel task execution")
}
