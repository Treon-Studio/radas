package workspace

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/graph"
)

func runAffected(cmd *cobra.Command) error {
	projects, _, root, err := loadProjects()
	if err != nil {
		return err
	}
	g, err := graph.Build(projects)
	if err != nil {
		return err
	}
	base, _ := cmd.Flags().GetString("base")
	asJSON, _ := cmd.Flags().GetBool("json")

	aff, err := g.Affected(root, base, "HEAD")
	if err != nil {
		return err
	}
	if asJSON {
		data, _ := json.Marshal(map[string][]string{"affected": aff})
		fmt.Fprintln(cmd.OutOrStdout(), string(data))
		return nil
	}
	if len(aff) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "No projects affected.")
		return nil
	}
	fmt.Fprintln(cmd.OutOrStdout(), "Affected projects:")
	for _, n := range aff {
		fmt.Fprintf(cmd.OutOrStdout(), "  - %s\n", n)
	}
	return nil
}
