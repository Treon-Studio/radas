package frontend

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"saru/internal/frontend/generator"
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
	genAPICmd.Flags().StringVar(&genAPIOutput, "output", "./src/api", "Output directory")
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

		if verbose {
			fmt.Printf("Generating client code from: %s\n", genAPISpec)
			fmt.Printf("Output directory: %s\n", outputDir)
		}

		// Panggil logic generator di internal/frontend/generator
		gen := generator.New(&generator.Config{
			InputSpec:   genAPISpec,
			OutputDir:   outputDir,
			BaseURL:     baseURL,
			GenerateAll: genAPIAll,
			ZodiosOnly:  genAPIZodios,
			HooksOnly:   genAPIHooks,
			StoresOnly:  genAPIStores,
			Verbose:     verbose,
		})
		return gen.Generate()
	},
}
