package workspace

import (
	"fmt"

	"github.com/raizora/radas/v4/internal/generator"
	"github.com/spf13/cobra"
)

var (
	generateOutDir         string
	generateVars           []string
	generateForce          bool
	generateNonInteractive bool
	generateTemplateDir    string
)

var generateCmd = &cobra.Command{
	Use:   "generate <template-name>",
	Short: "Generate code from a template",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		overrides := make(map[string]string)
		for _, v := range generateVars {
			parts := splitVar(v)
			if parts == nil {
				return fmt.Errorf("invalid --var format %q, expected key=value", v)
			}
			overrides[parts[0]] = parts[1]
		}

		err := generator.GenerateTemplateWith(generator.GenerateSettings{
			TemplateName:   args[0],
			Overrides:      overrides,
			OutDir:         generateOutDir,
			Force:          generateForce,
			NonInteractive: generateNonInteractive,
			TemplateDir:    generateTemplateDir,
		})
		if err != nil {
			return err
		}

		cmd.Println("Generated from template:", args[0])
		return nil
	},
}

func init() {
	Cmd.AddCommand(generateCmd)

	generateCmd.Flags().StringVarP(&generateOutDir, "output-dir", "o", ".", "Output directory")
	generateCmd.Flags().StringArrayVar(&generateVars, "var", nil, "Template variable (key=value)")
	generateCmd.Flags().BoolVarP(&generateForce, "force", "f", false, "Overwrite existing files")
	generateCmd.Flags().BoolVar(&generateNonInteractive, "non-interactive", false, "Skip prompts, use defaults")
	generateCmd.Flags().StringVarP(&generateTemplateDir, "template-dir", "T", "./templates", "Template directory")
}

func splitVar(v string) []string {
	for i := 0; i < len(v); i++ {
		if v[i] == '=' {
			return []string{v[:i], v[i+1:]}
		}
	}
	return nil
}
