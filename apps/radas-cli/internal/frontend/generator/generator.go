package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"radas/internal/frontend/parser"
)

type Config struct {
	InputSpec   string
	OutputDir   string
	BaseURL     string
	GenerateAll bool
	ZodiosOnly  bool
	HooksOnly   bool
	StoresOnly  bool
	Verbose     bool
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

	spec, err := parser.ParseOpenAPI(g.config.InputSpec)
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
		if err := g.generateReactQuery(spec); err != nil {
			return fmt.Errorf("failed to generate React Query hooks: %w", err)
		}
	}
	if g.config.GenerateAll || g.config.StoresOnly {
		if err := g.generateZustand(); err != nil {
			return fmt.Errorf("failed to generate Zustand stores: %w", err)
		}
	}
	// Always generate types
	if err := g.generateTypes(); err != nil {
		return fmt.Errorf("failed to generate types: %w", err)
	}

	if g.config.Verbose {
		fmt.Printf("✅ Code generation completed in: %s\n", g.config.OutputDir)
	}
	return nil
}

func (g *Generator) generateZodios(spec *parser.ParsedSpec) error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating Zodios client...")
	}

	schemaTS, schemaNames := generateSchemasTS(spec)

	content := "// AUTO-GENERATED Zodios client\n" +
		"import { makeApi, Zodios, type ZodiosOptions } from '@zodios/core'\n" +
		"import { z } from 'zod'\n\n"
	content += schemaTS + "\n"
	content += "export const schemas = {\n"
	for _, name := range schemaNames {
		content += "\t" + name + ",\n"
	}
	content += "};\n\n"

	content += "const endpoints = makeApi([\n"
	for _, op := range spec.Operations {
		content += "\t{\n"
		content += fmt.Sprintf("\t\tmethod: \"%s\",\n", strings.ToLower(op.Method))
		content += fmt.Sprintf("\t\tpath: \"%s\",\n", op.Path)
		content += fmt.Sprintf("\t\talias: \"%s\",\n", op.ID)
		if op.Description != "" {
			content += fmt.Sprintf("\t\tdescription: `%s`,\n", op.Description)
		}
		content += "\t\trequestFormat: \"json\",\n"

		// Parameters
		if len(op.Parameters) > 0 || op.RequestBody != nil {
			content += "\t\tparameters: [\n"
			for _, p := range op.Parameters {
				schema := goTypeToZod(p.Schema)
				content += fmt.Sprintf("\t\t\t{ name: \"%s\", type: \"%s\", schema: %s },\n", p.Name, p.Type, schema)
			}
			if op.RequestBody != nil {
				schema := goTypeToZod(op.RequestBody.Schema)
				content += fmt.Sprintf("\t\t\t{ name: \"body\", type: \"Body\", schema: %s },\n", schema)
			}
			content += "\t\t],\n"
		}

		// Response
		respSchema := "z.any()"
		for _, resp := range op.Responses {
			if resp.Schema != "" {
				respSchema = goTypeToZod(resp.Schema)
				break
			}
		}
		content += fmt.Sprintf("\t\tresponse: %s,\n", respSchema)

		// Errors
		hasError := false
		for status, resp := range op.Responses {
			if status != "200" && status != "201" && resp.Schema != "" {
				hasError = true
				break
			}
		}
		if hasError {
			content += "\t\terrors: [\n"
			for status, resp := range op.Responses {
				if status != "200" && status != "201" && resp.Schema != "" {
					content += fmt.Sprintf("\t\t\t{ status: %s, description: `%s`, schema: %s },\n", status, resp.Description, goTypeToZod(resp.Schema))
				}
			}
			content += "\t\t],\n"
		}
		content += "\t},\n"
	}
	content += "])\n\n"
	content += "export const api = new Zodios(endpoints);\n\n"
	content += "export function createApiClient(baseUrl: string, options?: ZodiosOptions) {\n    return new Zodios(baseUrl, endpoints, options);\n}\n"
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
	switch t {
	case "string":
		return "z.string()"
	case "number":
		return "z.number()"
	case "boolean":
		return "z.boolean()"
	case "array":
		return "z.array(z.any())"
	case "object":
		return "z.object({}).passthrough()"
	default:
		if strings.HasSuffix(t, "Schema") || strings.HasPrefix(t, "z.") {
			return t
		}
		return "z.any()"
	}
}


func (g *Generator) generateReactQuery(spec *parser.ParsedSpec) error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating React Query hooks...")
	}
	content := "// AUTO-GENERATED React Query hooks\nimport { useQuery } from '@tanstack/react-query'\nimport { apiClient } from './client'\n\n"
	for _, op := range spec.Operations {
		if strings.ToUpper(op.Method) == "GET" {
			content += fmt.Sprintf("export function use%sQuery(params?: any) {\n  return useQuery(['%s'], () => apiClient.%s(params))\n}\n\n", capitalize(op.ID), op.ID, op.ID)
		}
	}
	return g.writeFile("hooks.ts", content)
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
	content := "// Zustand stores (mock)\nexport const useStore = () => {}"
	return g.writeFile("stores.ts", content)
}

func (g *Generator) generateTypes() error {
	if g.config.Verbose {
		fmt.Println("[GEN] Generating TypeScript types...")
	}
	content := "// Types (mock)\nexport type User = {}"
	return g.writeFile("types.ts", content)
}

func (g *Generator) writeFile(filename, content string) error {
	filePath := filepath.Join(g.config.OutputDir, filename)
	return os.WriteFile(filePath, []byte(content), 0644)
}
