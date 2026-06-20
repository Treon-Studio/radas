package workspace

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/raizora/radas/v4/internal/generator"
	"github.com/spf13/cobra"
)

var templateCmd = &cobra.Command{
	Use:   "template",
	Short: "Manage workspace templates",
}

var templateDir string

var templateListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available templates",
	RunE: func(cmd *cobra.Command, args []string) error {
		reg := &generator.Registry{
			TemplateDirs: []string{templateDir},
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

var templateAddCmd = &cobra.Command{
	Use:   "add <git-url>",
	Short: "Add a template from a git repository",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		remoteURL := args[0]
		targetDir := templateDir

		reg := &generator.Registry{}
		tmpl, err := reg.Add(remoteURL, targetDir)
		if err != nil {
			return fmt.Errorf("add template: %w", err)
		}

		cmd.Printf("Added template %q from %s\n", tmpl.Name, remoteURL)
		cmd.Printf("  Location: %s\n", tmpl.Dir)
		return nil
	},
}

var templateCreateCmd = &cobra.Command{
	Use:   "create <name>",
	Short: "Create a new local template scaffold",
	Args:  cobra.ExactArgs(1),
	Long: `Creates a new template directory under ./templates/ with a
template.yml definition file and a sample .gotpl file.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		name := args[0]
		targetDir := filepath.Join(".", "templates", name)

		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return fmt.Errorf("create template dir: %w", err)
		}

		ymlContent := fmt.Sprintf(`name: %s
description: A %s template
version: 1
variables:
  - name: name
    description: Name of the thing
    prompt: What is the name?
    default: my-thing
outputs:
  - template: main.gotpl
    target: "{{.name}}.md"
`, name, name)

		ymlPath := filepath.Join(targetDir, "template.yml")
		if err := os.WriteFile(ymlPath, []byte(ymlContent), 0644); err != nil {
			return fmt.Errorf("write template.yml: %w", err)
		}

		gotplContent := fmt.Sprintf(`# {{.name}}

Generated from the %s template.
`, name)

		gotplPath := filepath.Join(targetDir, "main.gotpl")
		if err := os.WriteFile(gotplPath, []byte(gotplContent), 0644); err != nil {
			return fmt.Errorf("write main.gotpl: %w", err)
		}

		cmd.Printf("Created template %q at %s\n", name, targetDir)
		cmd.Println("  Edit template.yml to configure variables and outputs")
		cmd.Println("  Edit .gotpl files to customize template content")
		return nil
	},
}

func init() {
	templateCmd.AddCommand(templateListCmd)
	templateCmd.AddCommand(templateAddCmd)
	templateCmd.AddCommand(templateCreateCmd)

	templateListCmd.Flags().StringVarP(&templateDir, "template-dir", "T", "./templates", "Template directory")
	templateAddCmd.Flags().StringVarP(&templateDir, "template-dir", "T", "./templates", "Template directory")
}
