package api

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"

	"radas/internal/frontend/parser"
)

// templateFuncs contains helper functions for templates
var templateFuncs = template.FuncMap{
	"capitalize":             capitalize,
	"extractTSType":          extractTSType,
	"hasParams":              hasParams,
	"toUpper":                strings.ToUpper,
	"toLower":                strings.ToLower,
	"dict":                   dict,
	"set":                    set,
	"replace":                 replace,
	"camelCase":              camelCase,
	"contains":               contains,
	"last":                  last,
	"schemaToZod":            schemaToZodTemplate,
	"tsType":                 goTypeToTSType,
	"isRequired":             isRequired,
	"hasErrorResponses":      hasErrorResponses,
	"isErrorStatus":          isErrorStatus,
	"getResponseSchema":      getResponseSchema,
	"paramType":              paramTypeTemplate,
	"returnType":             returnTypeTemplate,
	"shouldInvalidateCache":  shouldInvalidateCache,
	"actionName":             actionName,
	"extractDTOType":         extractDTOType,
	"hasPathParams":          hasPathParams,
	"hasQueryParams":         hasQueryParams,
	"hasHeaderParams":        hasHeaderParams,
	"returnTypePromise":      returnTypePromise,
	"shouldInvalidateQueries": shouldInvalidateQueries,
	"hasRelatedGetOperation":  hasRelatedGetOperation,
	"getRelatedListOperation": getRelatedListOperation,
	"getRelatedGetOperation":  getRelatedGetOperation,
	"pathWithParams":         pathWithParams,
	"pathToTemplate":         pathToTemplate,
	"zodType":                zodType,
	"getSuccessResponseSchema": getSuccessResponseSchema,
}

type Config struct {
	InputSpec      string
	OutputDir      string
	BaseURL        string
	GenerateAll    bool
	ZodiosOnly     bool
	HooksOnly      bool
	StoresOnly     bool
	Verbose        bool
	SkipValidation bool
	ErrorsOnly     bool
}

type Generator struct {
	config *Config
}

func New(config *Config) *Generator {
	return &Generator{config: config}
}

func (g *Generator) Generate() error {
	if g.config.Verbose {
		fmt.Printf("[GEN] Parsing OpenAPI spec: %s\n", g.config.InputSpec)
	}

	// Pass validation flags to the parser
	parserOptions := parser.OpenAPIOptions{
		SkipValidation: g.config.SkipValidation,
		ErrorsOnly:     g.config.ErrorsOnly,
	}

	spec, err := parser.ParseOpenAPI(g.config.InputSpec, parserOptions)
	if err != nil {
		return fmt.Errorf("failed to parse OpenAPI spec: %w", err)
	}

	// Create output directory
	if err := os.MkdirAll(g.config.OutputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	if g.config.GenerateAll || g.config.ZodiosOnly {
		if err := g.generateZodios(spec); err != nil {
			return fmt.Errorf("failed to generate Zodios client: %w", err)
		}
	}
	if g.config.GenerateAll || g.config.HooksOnly {
		if err := g.generateQueries(spec); err != nil {
			return fmt.Errorf("failed to generate React Query hooks: %w", err)
		}
	}
	if g.config.GenerateAll || g.config.StoresOnly {
		if err := g.generateZustand(); err != nil {
			return fmt.Errorf("failed to generate Zustand stores: %w", err)
		}
	}
	// Always generate DTOs
	if err := g.generateDTO(); err != nil {
		return fmt.Errorf("failed to generate DTOs: %w", err)
	}

	if g.config.Verbose {
		fmt.Printf("✅ Code generation completed in: %s\n", g.config.OutputDir)
	}
	return nil
}

// execTemplate executes a template with the given data and returns the result as a string
func (g *Generator) execTemplate(templateName string, data interface{}) (string, error) {
	// Get template content from embedded templates
	templateContent, exists := templates[templateName]
	if !exists {
		return "", fmt.Errorf("template %s not found in embedded templates", templateName)
	}
	
	// Parse the template
	tmpl, err := template.New(templateName).Funcs(templateFuncs).Parse(templateContent)
	if err != nil {
		return "", fmt.Errorf("failed to parse template %s: %w", templateName, err)
	}
	
	buf := new(bytes.Buffer)
	err = tmpl.Execute(buf, data)
	if err != nil {
		return "", fmt.Errorf("failed to execute template %s: %w", templateName, err)
	}
	
	return buf.String(), nil
}

func (g *Generator) generateZodios(spec *parser.ParsedSpec) error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating Zodios client...")
	}

	// Create template data with BaseURL
	templateData := struct {
		*parser.ParsedSpec
		BaseURL string
	}{
		ParsedSpec: spec,
		BaseURL:    g.config.BaseURL,
	}

	content, err := g.execTemplate("client.tmpl", templateData)
	if err != nil {
		return fmt.Errorf("failed to generate client: %w", err)
	}

	return g.writeFile("client.ts", content)
}

// generateSchemasTS menghasilkan kode TypeScript untuk semua schemas dan mengembalikan urutan nama schema
func generateSchemasTS(spec *parser.ParsedSpec) (string, []string) {
	var out strings.Builder
	var names []string
	for _, s := range spec.Schemas {
		ts := schemaToZod(s)
		out.WriteString(fmt.Sprintf("const %s = %s\n", s.Name, ts))
		names = append(names, s.Name)
	}
	return out.String(), names
}

// schemaToZod mengubah schema Go ke kode zod object
func schemaToZod(s parser.Schema) string {
	var props []string
	for k, t := range s.Properties {
		props = append(props, fmt.Sprintf("%s: %s", k, goTypeToZod(fmt.Sprintf("%v", t))))
	}
	return fmt.Sprintf("z.object({ %s }).partial().passthrough()", strings.Join(props, ", "))
}

// goTypeToZod mengubah tipe Go/schema ke string zod
func goTypeToZod(t string) string {
	// Check if the type includes nullable information
	isNullable := false
	if strings.HasSuffix(t, " | null") {
		isNullable = true
		t = strings.TrimSuffix(t, " | null")
	}
	
	var zodType string
	switch t {
	case "string":
		zodType = "z.string()"
	case "number":
		zodType = "z.number()"
	case "boolean":
		zodType = "z.boolean()"
	case "array":
		zodType = "z.array(z.any())"
	case "object":
		zodType = "z.object({}).passthrough()"
	case "null":
		return "z.null()" // Direct null type from OpenAPI 3.1.0
	default:
		if strings.HasSuffix(t, "Schema") || strings.HasPrefix(t, "z.") {
			return t // Already a Zod schema reference
		}
		zodType = "z.any()"
	}
	
	// Add nullable() if needed
	if isNullable {
		return zodType + ".nullable()"
	}
	
	return zodType
}


func (g *Generator) generateQueries(spec *parser.ParsedSpec) error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating React Query hooks...")
	}

	// First generate the queryClient file
	queryClientData := struct {
		BaseURL string
	}{
		BaseURL: g.config.BaseURL,
	}
	queryClientContent, err := g.execTemplate("queryClient.tmpl", queryClientData)
	if err != nil {
		return fmt.Errorf("failed to generate query client: %w", err)
	}

	if err := g.writeFile("queryClient.ts", queryClientContent); err != nil {
		return err
	}

	// Group operations by namespace/entity for better organization
	groupedOps := make(map[string][]parser.Operation)
	for _, op := range spec.Operations {
		namespace := op.Namespace
		if namespace == "" {
			namespace = "api"
		}
		groupedOps[namespace] = append(groupedOps[namespace], op)
	}

	// Create data for the template
	templateData := struct {
		GroupedOps map[string][]parser.Operation
		Spec       *parser.ParsedSpec
		BaseURL    string
	}{
		GroupedOps: groupedOps,
		Spec:       spec,
		BaseURL:    g.config.BaseURL,
	}

	// Generate queries content using template
	content, err := g.execTemplate("queries.tmpl", templateData)
	if err != nil {
		return fmt.Errorf("failed to generate queries: %w", err)
	}

	return g.writeFile("queries.ts", content)
}

func capitalize(s string) string {
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func (g *Generator) generateZustand() error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating Zustand stores...")
	}
	
	// First we need to get the parsed spec to group operations by namespace
	parserOptions := parser.OpenAPIOptions{
		SkipValidation: g.config.SkipValidation,
		ErrorsOnly:     g.config.ErrorsOnly,
	}
	
	spec, err := parser.ParseOpenAPI(g.config.InputSpec, parserOptions)
	if err != nil {
		return fmt.Errorf("failed to parse OpenAPI spec: %w", err)
	}
	
	// Group operations by namespace/entity for better organization
	groupedOps := make(map[string][]parser.Operation)
	for _, op := range spec.Operations {
		namespace := op.Namespace
		if namespace == "" {
			namespace = "api"
		}
		groupedOps[namespace] = append(groupedOps[namespace], op)
	}
	
	// Create data for the template
	templateData := struct {
		GroupedOps map[string][]parser.Operation
		Spec       *parser.ParsedSpec
		BaseURL    string
	}{
		GroupedOps: groupedOps,
		Spec:       spec,
		BaseURL:    g.config.BaseURL,
	}
	
	// Generate stores content using template
	content, err := g.execTemplate("stores.tmpl", templateData)
	if err != nil {
		return fmt.Errorf("failed to generate stores: %w", err)
	}
	
	return g.writeFile("stores.ts", content)
}

func (g *Generator) generateDTO() error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating TypeScript DTOs...")
	}
	
	// Read the spec to get the schemas
	parserOptions := parser.OpenAPIOptions{
		SkipValidation: g.config.SkipValidation,
		ErrorsOnly:     g.config.ErrorsOnly,
	}
	
	spec, err := parser.ParseOpenAPI(g.config.InputSpec, parserOptions)
	if err != nil {
		return fmt.Errorf("failed to parse OpenAPI spec: %w", err)
	}
	
	// Create template data with BaseURL
	templateData := struct {
		*parser.ParsedSpec
		BaseURL string
	}{
		ParsedSpec: spec,
		BaseURL:    g.config.BaseURL,
	}
	
	// Generate content using template
	content, err := g.execTemplate("dto.tmpl", templateData)
	if err != nil {
		return fmt.Errorf("failed to generate DTOs: %w", err)
	}
	
	return g.writeFile("dto.ts", content)
}

func (g *Generator) writeFile(filename, content string) error {
	filePath := filepath.Join(g.config.OutputDir, filename)
	return os.WriteFile(filePath, []byte(content), 0644)
}
