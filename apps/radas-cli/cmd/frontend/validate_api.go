package frontend

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/jedib0t/go-pretty/v6/text"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"radas/internal/frontend/parser"
	"radas/internal/utils"
)

var (
	validateAPISpec    string
	validateAPIVerbose bool
	validateAPIErrors  bool
)

func init() {
	validateAPICmd.Flags().StringVarP(&validateAPISpec, "spec", "s", "./merged-api.json", "Input OpenAPI specification file")
	validateAPICmd.Flags().BoolVar(&validateAPIVerbose, "verbose", false, "Enable verbose output")
	validateAPICmd.Flags().BoolVar(&validateAPIErrors, "errors-only", false, "Show only error level issues (not warnings)")

	viper.BindPFlag("frontend.validate-api.verbose", validateAPICmd.Flags().Lookup("verbose"))
}

var validateAPICmd = &cobra.Command{
	Use:   "validate-api",
	Short: "Validate OpenAPI specification against OpenAPI 3.1 standards",
	Long:  `Validate OpenAPI specification file against OpenAPI 3.1 standards, ensuring best practices and specification compliance`,
	RunE: func(cmd *cobra.Command, args []string) error {
		verbose := validateAPIVerbose
		specPath := validateAPISpec
		errorsOnly := validateAPIErrors

		// If spec was not explicitly provided, try to find radas.yml
		if !cmd.Flags().Changed("spec") {
			configPath, err := FindConfig()
			if err == nil {
				// Found radas.yml, try to parse it
				cfg, err := ParseConfig(configPath)
				if err == nil && len(cfg.Contract.API) > 0 {
					// Use the first API spec from the configuration
					baseDir := filepath.Dir(configPath)
					specPath = ResolvePath(baseDir, cfg.Contract.API[0].Path)
					fmt.Printf("Using API spec from radas.yml: %s\n", specPath)
				}
			}
		}

		// Verify the spec file exists
		if _, err := os.Stat(specPath); os.IsNotExist(err) {
			return fmt.Errorf("API spec file not found: %s", specPath)
		}

		if verbose {
			fmt.Printf("Validating OpenAPI spec: %s\n", specPath)
		}

		// Load the OpenAPI document
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
		result := parser.ValidateOpenAPI(doc)

		// Print summary
		fmt.Println("\n=== Validation Results ===")
		
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
		
		// Display issues in a table format
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
		
		if result.Valid {
			fmt.Println("\n✅ OpenAPI specification is valid according to OpenAPI 3.1 standards.")
		} else {
			fmt.Println("\n❌ OpenAPI specification has validation errors that should be fixed.")
			// Return non-zero exit code for CI/CD pipelines
			os.Exit(1)
		}
		
		return nil
	},
}
