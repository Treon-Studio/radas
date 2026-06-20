package workspace

import "github.com/spf13/cobra"

var graphCmd = &cobra.Command{
	Use:   "graph",
	Short: "Visualize the workspace dependency graph",
	RunE: func(cmd *cobra.Command, args []string) error { return runGraph(cmd) },
}

func init() {
	graphCmd.Flags().StringP("output", "o", "", "output format: svg|png|json")
	graphCmd.Flags().String("file", "", "output file path")
	graphCmd.Flags().Bool("web", false, "open interactive browser viewer")
	graphCmd.Flags().Bool("ascii", false, "force ASCII output (default)")
}
