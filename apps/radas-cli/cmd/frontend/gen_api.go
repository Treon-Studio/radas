package frontend

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"radas/internal/frontend/generator"
)



var (
	genAPISpec     string
	genAPIOutput   string
	genAPIBaseURL  string
	genAPIVerbose  bool
	genAPIAll      bool
	genAPIZodios   bool
	genAPIHooks    bool
	genAPIStores   bool
)

func init() {

	genAPICmd.Flags().StringVarP(&genAPISpec, "spec", "s", "./merged-api.json", "Input OpenAPI specification file")
	genAPICmd.Flags().StringVar(&genAPIOutput, "output", "./src/__generated__/api", "Output directory")
	genAPICmd.Flags().StringVar(&genAPIBaseURL, "base-url", "https://api.example.com", "Base URL for API")
	genAPICmd.Flags().BoolVar(&genAPIVerbose, "verbose", false, "Enable verbose logging")
	genAPICmd.Flags().BoolVar(&genAPIAll, "all", true, "Generate all client types")
	genAPICmd.Flags().BoolVar(&genAPIZodios, "zodios", false, "Generate only Zodios client")
	genAPICmd.Flags().BoolVar(&genAPIHooks, "hooks", false, "Generate only React Query hooks")
	genAPICmd.Flags().BoolVar(&genAPIStores, "stores", false, "Generate only Zustand stores")

	viper.BindPFlag("frontend.gen-api.output", genAPICmd.Flags().Lookup("output"))
	viper.BindPFlag("frontend.gen-api.base-url", genAPICmd.Flags().Lookup("base-url"))
	viper.BindPFlag("frontend.gen-api.verbose", genAPICmd.Flags().Lookup("verbose"))
}



var genAPICmd = &cobra.Command{
	Use:   "gen-api",
	Short: "Generate TypeScript client code from OpenAPI spec",
	Long:  `Generate Zodios client, React Query hooks, and Zustand stores from OpenAPI spec`,
	RunE: func(cmd *cobra.Command, args []string) error {
		outputDir := viper.GetString("frontend.gen-api.output")
		baseURL := viper.GetString("frontend.gen-api.base-url")
		verbose := viper.GetBool("frontend.gen-api.verbose")
		specPath := genAPISpec

		// Check if a flag was explicitly provided
		specProvided := cmd.Flags().Changed("spec")

		// If spec was not explicitly provided, try to find radas.yml
		if !specProvided {
			configPath, err := FindConfig()
			if err == nil {
				// Found radas.yml, try to parse it
				cfg, err := ParseConfig(configPath)
				if err == nil && len(cfg.Contract.API) > 0 {
					// Use the first API spec from the configuration
					baseDir := filepath.Dir(configPath)
					specPath = ResolvePath(baseDir, cfg.Contract.API[0].Path)
					
					// Use the project name for output directory if it's not explicitly provided
					if !cmd.Flags().Changed("output") {
						outputDir = filepath.Join(baseDir, "__generated__/api")
					}
					
					fmt.Printf("Using API spec from radas.yml: %s\n", specPath)
				}
			}
		}

		// Verify the spec file exists
		if _, err := os.Stat(specPath); os.IsNotExist(err) {
			return fmt.Errorf("API spec file not found: %s", specPath)
		}

		if verbose {
			fmt.Printf("Generating client code from: %s\n", specPath)
			fmt.Printf("Output directory: %s\n", outputDir)
		}

		// Call API generator with the new architecture
		return generator.GenerateAPI(specPath, outputDir, baseURL, verbose)
	},
}
