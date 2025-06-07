package parser

import (
	"context"
	"fmt"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

type Operation struct {
	ID          string
	Method      string
	Path        string
	Summary     string
	Description string
	Tags        []string
	Parameters  []Parameter
	RequestBody *RequestBody
	Responses   map[string]Response
	Namespace   string
	Entity      string
}

type Parameter struct {
	Name     string
	In       string
	Required bool
	Schema   string
	Type     string
}

type RequestBody struct {
	Required bool
	Schema   string
}

type Response struct {
	Description string
	Schema      string
}

type Schema struct {
	Name       string
	Type       string
	Properties map[string]interface{}
	Required   []string
	Namespace  string
}

type ParsedSpec struct {
	Operations []Operation
	Schemas    []Schema
	Namespaces map[string][]string
}

// OpenAPIOptions contains options for parsing OpenAPI specifications
type OpenAPIOptions struct {
	SkipValidation bool // Skip OpenAPI validation entirely
	ErrorsOnly     bool // Show only error level validation issues (not warnings)
}

func ParseOpenAPI(specPath string, options ...OpenAPIOptions) (*ParsedSpec, error) {
	// Process options
	var opts OpenAPIOptions
	if len(options) > 0 {
		opts = options[0]
	}
	ctx := context.Background()
	// Configure loader for OpenAPI 3.1.0 support
	loader := &openapi3.Loader{
		Context: ctx, 
		IsExternalRefsAllowed: true,
	}

	doc, err := loader.LoadFromFile(specPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load OpenAPI spec: %w", err)
	}

	// Handle validation based on options
	if !opts.SkipValidation {
		validationErr := doc.Validate(ctx)
		if validationErr != nil {
			// Check if this might be an OpenAPI 3.1.0 spec
			is31 := strings.HasPrefix(doc.OpenAPI, "3.1")
			
			// For OpenAPI 3.1.0 specs, we can be more lenient
			if is31 {
				fmt.Printf("⚠️ OpenAPI 3.1.0 spec detected. Continuing despite validation issues.\n")
				if !opts.ErrorsOnly {
					fmt.Printf("Validation warnings: %v\n", validationErr)
				}
			} else {
				// For OpenAPI 3.0 and below, we enforce strict validation
				return nil, fmt.Errorf("invalid OpenAPI spec: %w", validationErr)
			}
		}
	} else if strings.HasPrefix(doc.OpenAPI, "3.1") {
		fmt.Printf("⚠️ OpenAPI 3.1.0 spec detected. Validation skipped.\n")
	}

	parsed := &ParsedSpec{
		Operations: []Operation{},
		Schemas:    []Schema{},
		Namespaces: make(map[string][]string),
	}

	// Parse schemas
	if doc.Components != nil && doc.Components.Schemas != nil {
		for name, schemaRef := range doc.Components.Schemas {
			schema := parseSchema(name, schemaRef.Value)
			parsed.Schemas = append(parsed.Schemas, schema)
		}
	}

	// Parse operations
	for path, pathItem := range doc.Paths.Map() {
		operations := extractOperations(path, pathItem)
		parsed.Operations = append(parsed.Operations, operations...)
	}

	// Group by namespaces
	for _, op := range parsed.Operations {
		if op.Namespace != "" {
			parsed.Namespaces[op.Namespace] = append(parsed.Namespaces[op.Namespace], op.Entity)
		}
	}

	return parsed, nil
}

func getSchemaType(types *openapi3.Types) string {
	if types == nil || len(*types) == 0 {
		return ""
	}
	// Handle OpenAPI 3.1.0 types, including 'null'
	// If there are multiple types, prefer non-null types
	for _, t := range *types {
		if t != "null" {
			return t
		}
	}
	// If only null is available, return it
	return (*types)[0]
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func parseSchema(name string, schema *openapi3.Schema) Schema {
	namespace := ""
	originalName := name

	// Extract namespace from name (e.g., "users_User" -> namespace: "users", name: "User")
	if parts := strings.Split(name, "_"); len(parts) > 1 {
		namespace = parts[0]
		originalName = strings.Join(parts[1:], "_")
	}

	properties := make(map[string]interface{})
	if schema.Properties != nil {
		for propName, propRef := range schema.Properties {
			properties[propName] = convertSchemaType(propRef.Value)
		}
	}

	return Schema{
		Name:       originalName,
		Type:       getSchemaType(schema.Type),
		Properties: properties,
		Required:   schema.Required,
		Namespace:  namespace,
	}
}

func convertSchemaType(schema *openapi3.Schema) interface{} {
	schemaType := getSchemaType(schema.Type)
	
	switch schemaType {
	case "string":
		return "string"
	case "integer", "number":
		return "number"
	case "boolean":
		return "boolean"
	case "array":
		if schema.Items != nil {
			return map[string]interface{}{
				"type": "array",
				"items": convertSchemaType(schema.Items.Value),
			}
		}
		return "array"
	case "object":
		return "object"
	case "null":
		// Handle null type from OpenAPI 3.1.0
		return "null"
	default:
		return "any"
	}
}

func extractOperations(path string, pathItem *openapi3.PathItem) []Operation {
	operations := []Operation{}

	methods := map[string]*openapi3.Operation{
		"GET":    pathItem.Get,
		"POST":   pathItem.Post,
		"PUT":    pathItem.Put,
		"DELETE": pathItem.Delete,
		"PATCH":  pathItem.Patch,
	}

	for method, operation := range methods {
		if operation == nil {
			continue
		}

		op := Operation{
			ID:          operation.OperationID,
			Method:      method,
			Path:        path,
			Summary:     operation.Summary,
			Description: operation.Description,
			Tags:        operation.Tags,
			Parameters:  extractParameters(operation.Parameters),
		}

		// Extract namespace and entity from tags or operationId
		if len(operation.Tags) > 0 {
			op.Namespace = operation.Tags[0]
			if len(operation.Tags) > 1 {
				op.Entity = operation.Tags[1]
			}
		}

		// Extract from operationId (e.g., "users_getUsers" -> namespace: "users", entity: "users")
		if op.ID != "" && strings.Contains(op.ID, "_") {
			parts := strings.Split(op.ID, "_")
			if len(parts) >= 2 {
				op.Namespace = parts[0]
				op.Entity = parts[0] // or derive from operation
			}
		}

		// Extract request body
		if operation.RequestBody != nil {
			op.RequestBody = extractRequestBody(operation.RequestBody)
		}

		operations = append(operations, op)
	}

	return operations
}

func extractParameters(params openapi3.Parameters) []Parameter {
	parameters := []Parameter{}

	for _, paramRef := range params {
		if paramRef.Value != nil {
			param := Parameter{
				Name:     paramRef.Value.Name,
				In:       paramRef.Value.In,
				Required: paramRef.Value.Required,
				Type:     getParameterType(paramRef.Value.In),
			}

			if paramRef.Value.Schema != nil && paramRef.Value.Schema.Value != nil {
				param.Schema = getSchemaReference(paramRef.Value.Schema.Value)
			}

			parameters = append(parameters, param)
		}
	}

	return parameters
}

func extractRequestBody(requestBody *openapi3.RequestBodyRef) *RequestBody {
	if requestBody.Value == nil {
		return nil
	}

	rb := &RequestBody{
		Required: requestBody.Value.Required,
	}

	// Extract schema from content (assuming JSON)
	if content := requestBody.Value.Content["application/json"]; content != nil {
		if content.Schema != nil {
			// Check if it's a reference to a component schema
			if content.Schema.Ref != "" {
				// Extract the schema name from the reference (e.g., "#/components/schemas/User" -> "User")
				parts := strings.Split(content.Schema.Ref, "/")
				if len(parts) > 0 {
					rb.Schema = parts[len(parts)-1]
				}
			} else if content.Schema.Value != nil {
				// Process inline schema
				rb.Schema = getSchemaReference(content.Schema.Value)
			}
		}
	}

	return rb
}

func extractResponses(responses *openapi3.Responses) map[string]Response {
	result := make(map[string]Response)

	for status, responseRef := range responses.Map() {
		if responseRef.Value != nil {
			response := Response{
				Description: derefString(responseRef.Value.Description),
			}

			// Extract schema from content (assuming JSON)
			if content := responseRef.Value.Content["application/json"]; content != nil {
				if content.Schema != nil {
					// Check if it's a reference to a component schema
					if content.Schema.Ref != "" {
						// Extract the schema name from the reference (e.g., "#/components/schemas/User" -> "User")
						parts := strings.Split(content.Schema.Ref, "/")
						if len(parts) > 0 {
							response.Schema = parts[len(parts)-1]
						}
					} else if content.Schema.Value != nil {
						// Process inline schema
						response.Schema = getSchemaReference(content.Schema.Value)
					}
				}
			}

			result[status] = response
		}
	}

	return result
}

func getParameterType(in string) string {
	switch in {
	case "query":
		return "Query"
	case "path":
		return "Path"
	case "header":
		return "Header"
	case "body":
		return "Body"
	default:
		return "Query"
	}
}

func getSchemaReference(schema *openapi3.Schema) string {
	// This is a simplified version - you might want to handle more complex cases
	schemaType := getSchemaType(schema.Type)
	
	// Check if the schema is nullable (OpenAPI 3.0 style)
	hasNullType := false
	if schema.Type != nil {
		for _, t := range *schema.Type {
			if t == "null" {
				hasNullType = true
				break
			}
		}
	}
	
	// Also check OpenAPI 3.0 nullable flag
	isNullable := schema.Nullable || hasNullType
	
	if schemaType == "array" && schema.Items != nil {
		itemRef := getSchemaReference(schema.Items.Value)
		if isNullable {
			return fmt.Sprintf("z.array(%s).nullable()", itemRef)
		}
		return fmt.Sprintf("z.array(%s)", itemRef)
	}

	// Handle different schema types with nullable support
	var zodType string
	switch schemaType {
	case "string":
		zodType = "z.string()"
	case "integer", "number":
		zodType = "z.number()"
	case "boolean":
		zodType = "z.boolean()"
	case "object":
		zodType = "z.object({}).passthrough()" // Better for handling unknown properties
	case "null":
		return "z.null()" // Direct null type
	default:
		zodType = "z.any()"
	}
	
	// Add nullable() if the schema is nullable
	if isNullable && schemaType != "null" {
		return zodType + ".nullable()"
	}
	
	return zodType
}
