package workspace

import (
	"fmt"

	"github.com/raizora/radas/v4/internal/generator"
	"github.com/spf13/cobra"
)

var templateCmd = &cobra.Command{
	Use:   "template",
	Short: "Manage workspace templates",
}

var templateListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available templates",
	RunE: func(cmd *cobra.Command, args []string) error {
		reg := &generator.Registry{
			TemplateDirs: []string{"./templates"},
		}
		templates, err := reg.Scan()
		if err != nil {
			return fmt.Errorf("list templates: %w", err)
		}

		if len(templates) == 0 {
			cmd.Println("No templates found in ./templates/")
			return nil
		}

		for _, t := range templates {
			desc := t.Description
			if desc == "" {
				desc = "(no description)"
			}
			cmd.Printf("  %-24s %s\n", t.Name, desc)
		}
		return nil
	},
}

func init() {
	templateCmd.AddCommand(templateListCmd)
}
