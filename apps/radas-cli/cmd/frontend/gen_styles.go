package frontend

import (
	"radas/internal/frontend/generator"
	"github.com/spf13/cobra"
)

var (
	stylesSourceDir  string
	stylesOutputDir  string
	stylesTypesList  []string
)

// genStylesCmd represents the gen-styles command
var genStylesCmd = &cobra.Command{
	Use:   "gen-styles",
	Short: "Generate CSS variables from design tokens",
	Long: `Generate CSS variables and other style formats from design tokens in JSON format.
These can be used to override styles in Tailwind v4 and Shadcn/UI implementations.

For example:
  radas fe gen-styles --source ./tokens --types css,scss --output ./src/__generated__/styles

If no source is specified, it will look for tokens in the ./tokens directory.
If no output is specified, files will be generated in ./__generated__/styles.
If no types are specified, all format types will be generated (css, scss, less, css-modules).`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Generate style variables using the new architecture
		return generator.GenerateStyles(stylesSourceDir, stylesOutputDir, stylesTypesList)
	},
}

func init() {
	Cmd.AddCommand(genStylesCmd)

	// Define flags
	genStylesCmd.Flags().StringVarP(&stylesSourceDir, "source", "s", "tokens", "Source directory containing design tokens in JSON format")
	genStylesCmd.Flags().StringVarP(&stylesOutputDir, "output", "o", "__generated__/styles", "Output directory for generated style files")
	genStylesCmd.Flags().StringSliceVarP(&stylesTypesList, "types", "t", []string{"all"}, "Types of style files to generate (css, scss, less, css-modules, or all)")
}
