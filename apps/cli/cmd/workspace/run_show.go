package workspace

import (
	"fmt"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/spf13/cobra"
)

func runShow(cmd *cobra.Command, args []string) error {
	projects, _, _, err := loadProjects()
	if err != nil {
		return err
	}
	var target *struct {
		Name, Type, Path string
		Dependencies     []string
	}
	for i := range projects {
		if projects[i].Name == args[0] {
			target = &struct {
				Name, Type, Path string
				Dependencies     []string
			}{projects[i].Name, projects[i].Type, projects[i].Path, projects[i].Dependencies}
			break
		}
	}
	if target == nil {
		return fmt.Errorf("project %q not found in workspace", args[0])
	}
	t := table.NewWriter()
	t.SetOutputMirror(cmd.OutOrStdout())
	t.AppendHeader(table.Row{"FIELD", "VALUE"})
	t.AppendRow(table.Row{"Name", target.Name})
	t.AppendRow(table.Row{"Type", target.Type})
	t.AppendRow(table.Row{"Path", target.Path})
	if len(target.Dependencies) > 0 {
		t.AppendRow(table.Row{"Dependencies", target.Dependencies})
	} else {
		t.AppendRow(table.Row{"Dependencies", "(none)"})
	}
	t.SetStyle(table.StyleLight)
	t.Render()
	return nil
}
