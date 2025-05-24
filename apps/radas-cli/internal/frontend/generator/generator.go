// Package generator provides frontend code generation functionality
package generator

import (
	"radas/internal/frontend/generator/api"
	"radas/internal/frontend/generator/styles"
)


func GenerateAPI(inputSpec, outputDir, baseURL string, verbose bool) error {
	config := &api.Config{
		InputSpec:   inputSpec,
		OutputDir:   outputDir,
		BaseURL:     baseURL,
		GenerateAll: true,
		Verbose:     verbose,
	}
	generator := api.New(config)
	return generator.Generate()
}
	 
func GenerateStyles(sourceDir, outputDir string, types []string) error {
	generator := styles.NewStylesGenerator(sourceDir, outputDir, types)
	return generator.Generate()
}
