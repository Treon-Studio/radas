package frontend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"radas/internal/frontend/generator"
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
		sourceDir := stylesSourceDir
		outputDir := stylesOutputDir
		types := stylesTypesList

		// Check if source directory was explicitly provided
		sourceProvided := cmd.Flags().Changed("source")

		// If source was not explicitly provided, try to find radas.yml
		if !sourceProvided {
			configPath, err := FindConfig()
			if err == nil {
				// Found radas.yml, try to parse it
				cfg, err := ParseConfig(configPath)
				if err == nil && len(cfg.Contract.Design) > 0 {
					// Use the first design token path from the configuration
					baseDir := filepath.Dir(configPath)
					sourceDir = ResolvePath(baseDir, cfg.Contract.Design[0].Path)
					
					// Use the design type if specified
					if cfg.Contract.Design[0].Type != "" && len(types) == 0 {
						types = []string{cfg.Contract.Design[0].Type}
					}
					
					// Use the project output directory if not explicitly provided
					if !cmd.Flags().Changed("output") {
						outputDir = filepath.Join(baseDir, "__generated__/styles")
					}
					
					fmt.Printf("Using design tokens from radas.yml: %s\n", sourceDir)
				}
			}
		}

		// Verify the source directory exists
		if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
			return fmt.Errorf("design tokens directory not found: %s", sourceDir)
		}

		// Print information about what we're generating
		typeStr := "all types"
		if len(types) > 0 {
			typeStr = strings.Join(types, ", ")
		}
		fmt.Printf("Generating styles (%s) from: %s\n", typeStr, sourceDir)
		fmt.Printf("Output directory: %s\n", outputDir)

		// Generate style variables using the new architecture
		return generator.GenerateStyles(sourceDir, outputDir, types)
	},
}

func init() {
	Cmd.AddCommand(genStylesCmd)

	// Define flags
	genStylesCmd.Flags().StringVarP(&stylesSourceDir, "source", "s", "tokens", "Source directory containing design tokens in JSON format")
	genStylesCmd.Flags().StringVarP(&stylesOutputDir, "output", "o", "__generated__/styles", "Output directory for generated style files")
	genStylesCmd.Flags().StringSliceVarP(&stylesTypesList, "types", "t", []string{"all"}, "Types of style files to generate (css, scss, less, css-modules, or all)")
}
