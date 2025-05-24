package frontend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"radas/internal/frontend/generator"
)

// genConfigPath holds the path to the radas.yml configuration file

var (
	genConfigPath string
)

// genAllCmd represents the command to generate everything from radas.yml
var genAllCmd = &cobra.Command{
	Use:   "gen",
	Short: "Generate frontend code from radas.yml configuration",
	Long: `Generate API clients and style variables from radas.yml configuration.
This command reads a radas.yml file and generates all necessary code based on the configuration.
It will process both design tokens and API specifications as defined in the contract section.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// If no config path provided, try to find radas.yml in current directory
		if genConfigPath == "" {
			var err error
			genConfigPath, err = FindConfig()
			if err != nil {
				return fmt.Errorf("failed to find radas.yml: %w", err)
			}
		}

		// Parse the configuration file
		cfg, err := ParseConfig(genConfigPath)
		if err != nil {
			return fmt.Errorf("failed to parse radas.yml: %w", err)
		}

		fmt.Printf("Generating code for project: %s\n", cfg.Name)
		fmt.Printf("Description: %s\n", cfg.Description)
		fmt.Printf("Stacks: %s\n", strings.Join(cfg.Stacks, ", "))

		// Base directory for relative paths in the config
		baseDir := filepath.Dir(genConfigPath)
		
		// Process design tokens if defined
		if len(cfg.Contract.Design) > 0 {
			for _, design := range cfg.Contract.Design {
				sourceDir := ResolvePath(baseDir, design.Path)
				// Ensure output is relative to radas.yml location
				outputDir := filepath.Join(baseDir, "__generated__/styles")
				
				// Ensure the source directory exists
				if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
					fmt.Printf("Warning: Design tokens directory %s does not exist, skipping\n", sourceDir)
					continue
				}
				
				fmt.Printf("Generating styles from: %s\n", sourceDir)
				
				// Determine style types
				var types []string
				if design.Type != "" {
					types = []string{design.Type}
				}
				
				// Generate styles
				if err := generator.GenerateStyles(sourceDir, outputDir, types); err != nil {
					return fmt.Errorf("failed to generate styles: %w", err)
				}
			}
		}
		
		// Process API specs if defined
		if len(cfg.Contract.API) > 0 {
			for _, api := range cfg.Contract.API {
				specPath := ResolvePath(baseDir, api.Path)
				// Ensure output is relative to radas.yml location
				outputDir := filepath.Join(baseDir, "__generated__/api")
				
				// Ensure the API spec exists
				if _, err := os.Stat(specPath); os.IsNotExist(err) {
					fmt.Printf("Warning: API spec %s does not exist, skipping\n", specPath)
					continue
				}
				
				fmt.Printf("Generating API client from: %s\n", specPath)
				
				// Generate API client
				if err := generator.GenerateAPI(specPath, outputDir, "", true); err != nil {
					return fmt.Errorf("failed to generate API client: %w", err)
				}
			}
		}
		
		fmt.Printf("✅ All code generation completed successfully for %s\n", cfg.Name)
		return nil
	},
}

func init() {
	Cmd.AddCommand(genAllCmd)
	
	// Add flags
	genAllCmd.Flags().StringVarP(&genConfigPath, "config", "c", "", "Path to radas.yml configuration file")
}


