package frontend

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/jedib0t/go-pretty/v6/text"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"radas/internal/frontend/generator"
	"radas/internal/frontend/parser"
	"radas/internal/utils"
)



var (
	genAPISpec             string
	genAPIOutput           string
	genAPIBaseURL          string
	genAPIVerbose          bool
	genAPIAll              bool
	genAPIZodios           bool
	genAPIHooks            bool
	genAPIStores           bool
	genAPISkipValidation   bool
	genAPIValidationErrors bool
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
	// Add validation flags
	genAPICmd.Flags().BoolVar(&genAPISkipValidation, "skip-validation", false, "Skip OpenAPI validation before code generation")
	genAPICmd.Flags().BoolVar(&genAPIValidationErrors, "validation-errors-only", false, "Show only error level validation issues (not warnings)")

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
		skipValidation := genAPISkipValidation
		errorsOnly := genAPIValidationErrors

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

		// Run validation before code generation unless skipped
		if !skipValidation {
			// Load the OpenAPI document for validation
			ctx := context.Background()
			loader := &openapi3.Loader{Context: ctx, IsExternalRefsAllowed: true}
			doc, err := loader.LoadFromFile(specPath)
			if err != nil {
				return fmt.Errorf("failed to load OpenAPI spec: %w", err)
			}

			// Detect OpenAPI version
			isOpenAPI31 := doc.OpenAPI == "3.1.0"
			fmt.Printf("OpenAPI Version: %s\n", doc.OpenAPI)
			if isOpenAPI31 {
				fmt.Println("Validating against OpenAPI 3.1.0 standards")
			}

			// Validate against OpenAPI 3.1 standards
			fmt.Println("Validating OpenAPI spec against OpenAPI 3.1 standards...")
			result := parser.ValidateOpenAPI(doc)

			// Print summary
			errors := 0
			warnings := 0
			
			for _, issue := range result.Issues {
				if issue.Severity == parser.ValidationError {
					errors++
				} else if issue.Severity == parser.ValidationWarning {
					warnings++
				}
			}
			
			fmt.Printf("Found %d errors and %d warnings.\n", errors, warnings)
			
			// Sort issues by severity (errors first) and then by path
			sort.Slice(result.Issues, func(i, j int) bool {
				if result.Issues[i].Severity != result.Issues[j].Severity {
					return result.Issues[i].Severity == parser.ValidationError
				}
				return result.Issues[i].Path < result.Issues[j].Path
			})
			
			// Display issues in a table format if there are any
			if len(result.Issues) > 0 {
				fmt.Println("\n=== Issues ===")
				
				// Prepare data for pretty table
				headers := []string{"Severity", "Rule", "Path", "Message"}
				headerColors := []text.Colors{
					{text.FgHiCyan, text.Bold},
					{text.FgHiCyan, text.Bold},
					{text.FgHiCyan, text.Bold},
					{text.FgHiCyan, text.Bold},
				}
				
				rows := [][]string{}
				colorFunc := func(row []string) text.Colors {
					if row[0] == string(parser.ValidationError) {
						return text.Colors{text.FgHiRed}
					} else if row[0] == string(parser.ValidationWarning) {
						return text.Colors{text.FgHiYellow}
					}
					return text.Colors{}
				}
				
				for _, issue := range result.Issues {
					// Skip warnings if errors-only flag is set
					if errorsOnly && issue.Severity != parser.ValidationError {
						continue
					}
					
					// Truncate long paths for display
					path := issue.Path
					if len(path) > 30 {
						path = "..." + path[len(path)-27:]
					}
					
					rows = append(rows, []string{
						string(issue.Severity),
						issue.Rule,
						path,
						issue.Message,
					})
				}
				
				// Create a custom pretty print table function that uses our color function
				utils.PrettyPrintTableWithRowColors(headers, headerColors, rows, nil, colorFunc)
			}
			
			// If there are validation errors, ask for confirmation before proceeding
			if !result.Valid {
				fmt.Println("\n⚠️  OpenAPI specification has validation errors!")
				fmt.Print("Do you want to continue with code generation anyway? (y/N): ")
				
				var answer string
				fmt.Scanln(&answer)
				
				if strings.ToLower(answer) != "y" && strings.ToLower(answer) != "yes" {
					return fmt.Errorf("code generation cancelled due to validation errors")
				}
				
				fmt.Println("Proceeding with code generation despite validation errors...")
			} else {
				fmt.Println("\n✅ OpenAPI specification is valid according to IBM standards.")
			}
		}

		// Call API generator
		return generator.GenerateAPI(specPath, outputDir, baseURL, verbose)
	},
}
