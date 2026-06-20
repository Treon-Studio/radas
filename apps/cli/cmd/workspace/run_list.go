package workspace

import (
	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/spf13/cobra"
)

func runList(cmd *cobra.Command) error {
	projects, _, _, err := loadProjects()
	if err != nil {
		return err
	}
	t := table.NewWriter()
	t.SetOutputMirror(cmd.OutOrStdout())
	t.AppendHeader(table.Row{"NAME", "TYPE", "PATH"})
	for _, p := range projects {
		t.AppendRow(table.Row{p.Name, p.Type, p.Path})
	}
	t.SetStyle(table.StyleLight)
	t.Render()
	return nil
}
