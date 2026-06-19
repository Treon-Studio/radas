package workspace

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/graph"
)

func runValidate(cmd *cobra.Command) error {
	projects, _, _, err := loadProjects()
	if err != nil {
		return err
	}
	if len(projects) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(),
			"warning: no projects found — workspace patterns may be stale")
	}
	g, err := graph.Build(projects)
	if err != nil {
		return fmt.Errorf("workspace has cycle or invalid edge: %w", err)
	}
	cycles, _ := g.DetectCycles()
	if cycles != nil {
		return fmt.Errorf("workspace has %d cycle(s)", len(cycles))
	}
	fmt.Fprintf(cmd.OutOrStdout(),
		"OK: %d projects, no cycles detected\n", len(projects))
	return nil
}
