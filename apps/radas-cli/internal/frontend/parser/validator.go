package parser

import (
	"fmt"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

// ValidationSeverity defines the severity levels for validation issues
type ValidationSeverity string

const (
	// ValidationError represents a serious issue that should be fixed
	ValidationError ValidationSeverity = "error"
	
	// ValidationWarning represents a non-critical issue that should be considered
	ValidationWarning ValidationSeverity = "warning"
	
	// ValidationInfo represents information that could be useful but isn't an issue
	ValidationInfo ValidationSeverity = "info"
)

// ValidationIssue represents a validation issue found in the OpenAPI document
type ValidationIssue struct {
	Severity ValidationSeverity `json:"severity"`
	Rule     string            `json:"rule"`
	Path     string            `json:"path"`
	Message  string            `json:"message"`
}

// ValidationResult contains the results of validating an OpenAPI document
type ValidationResult struct {
	Valid  bool              // Whether the document is valid according to the rules
	Issues []ValidationIssue // List of issues found
}

// ValidateOpenAPI validates an OpenAPI document against OpenAPI 3.1 standards
func ValidateOpenAPI(doc *openapi3.T) ValidationResult {
	result := ValidationResult{
		Valid:  true,
		Issues: []ValidationIssue{},
	}

	// Validate against OpenAPI 3.1.0 standards
	validateSchemas(doc, &result)
	validatePaths(doc, &result)
	validateOperations(doc, &result)
	validateResponses(doc, &result)
	validateWebhooks(doc, &result)
	
	// If any errors are found, the document is not valid
	for _, issue := range result.Issues {
		if issue.Severity == ValidationError {
			result.Valid = false
			break
		}
	}

	return result
}

// validateSchemas validates all schemas in the OpenAPI document
func validateSchemas(doc *openapi3.T, result *ValidationResult) {
	if doc.Components == nil || doc.Components.Schemas == nil {
		return
	}

	for name, schemaRef := range doc.Components.Schemas {
		if schemaRef.Value == nil {
			continue
		}

		path := fmt.Sprintf("components.schemas.%s", name)
		validateSchema(schemaRef.Value, path, result)
	}
}

// validateSchema validates a single schema against OpenAPI 3.1 standards
func validateSchema(schema *openapi3.Schema, path string, result *ValidationResult) {
	// Check for schema description
	if schema.Description == "" {
		result.Issues = append(result.Issues, ValidationIssue{
			Path:     path,
			Rule:     "schema-description",
			Message:  "Schema should have a description",
			Severity: ValidationWarning,
		})
	}

	// Check for multiple types - OpenAPI 3.1.0 allows multiple types
	// In kin-openapi v0.132.0, Type is a *Types which is a slice of strings
	// This is not an error in OpenAPI 3.1, but we note it as info
	if schema.Type != nil && len(schema.Type.Slice()) > 1 {
		result.Issues = append(result.Issues, ValidationIssue{
			Path:     path,
			Rule:     "multiple-types",
			Message:  "Schema uses multiple types (OpenAPI 3.1 feature)",
			Severity: ValidationInfo,
		})
	}

	// Check for array attributes
	schemaType := getPrimaryType(schema)
	if schemaType == "array" {
		if schema.Items == nil {
			result.Issues = append(result.Issues, ValidationIssue{
				Path:     path,
				Rule:     "array-items-required",
				Message:  "Array schema must define the items field",
				Severity: ValidationError, // This is required by OpenAPI spec
			})
		}
		
		// In kin-openapi v0.132.0, MinItems is uint64 and MaxItems is *uint64
		hasMinItems := schema.MinItems > 0
		hasMaxItems := schema.MaxItems != nil
		
		if !hasMinItems && !hasMaxItems {
			result.Issues = append(result.Issues, ValidationIssue{
				Path:     path,
				Rule:     "array-bounds",
				Message:  "Consider defining minItems and maxItems for better client validation",
				Severity: ValidationInfo, // This is a recommendation, not required
			})
		}
	}

	// Check for numeric bounds
	if schemaType == "integer" || schemaType == "number" {
		hasMin := schema.Min != nil
		hasMax := schema.Max != nil
		
		if !hasMin && !hasMax {
			result.Issues = append(result.Issues, ValidationIssue{
				Path:     path,
				Rule:     "numeric-bounds",
				Message:  "Consider defining minimum and maximum for better client validation",
				Severity: ValidationInfo, // This is a recommendation, not required
			})
		}
	}

	// Check for property descriptions
	if schema.Properties != nil {
		for propName, propRef := range schema.Properties {
			if propRef.Value == nil {
				continue
			}
			
			// Check if property has a description
			if propRef.Value.Description == "" {
				propPath := fmt.Sprintf("%s.properties.%s", path, propName)
				result.Issues = append(result.Issues, ValidationIssue{
					Path:     propPath,
					Rule:     "property-description",
					Message:  "Property should have a description for better documentation",
					Severity: ValidationWarning,
				})
			}
			
			// Recursively validate property schema
			propPath := fmt.Sprintf("%s.properties.%s", path, propName)
			validateSchema(propRef.Value, propPath, result)
		}
	}

	// Check for required properties definition
	if schema.Required != nil {
		for _, required := range schema.Required {
			if schema.Properties == nil || schema.Properties[required] == nil {
				result.Issues = append(result.Issues, ValidationIssue{
					Path:     path + ".required[" + required + "]",
					Rule:     "required-properties",
					Message:  fmt.Sprintf("Required property '%s' must be defined in the schema", required),
					Severity: ValidationError,
				})
			}
		}
	}

	// Check dictionary pattern
	// In kin-openapi v0.132.0, AdditionalProperties is a struct with Has and Schema fields
	if schemaType == "object" && schema.AdditionalProperties.Has != nil && *schema.AdditionalProperties.Has {
		// For dictionaries (objects with additionalProperties), suggest pattern validation
		result.Issues = append(result.Issues, ValidationIssue{
			Path:     path,
			Rule:     "dictionary-pattern",
			Message:  "Consider using pattern properties for dictionary key validation",
			Severity: ValidationInfo, // This is a recommendation, not required
		})
	}
}

// validatePaths validates all paths in the OpenAPI document
func validatePaths(doc *openapi3.T, result *ValidationResult) {
	if doc.Paths == nil {
		return
	}
	
	// Check for duplicate paths
	normalizedPaths := make(map[string]string)
	for path := range doc.Paths.Map() {
		normalized := normalizePath(path)
		if existingPath, ok := normalizedPaths[normalized]; ok {
			result.Issues = append(result.Issues, ValidationIssue{
				Path:     fmt.Sprintf("paths.%s", path),
				Rule:     "duplicate-paths",
				Message:  fmt.Sprintf("Path is semantically equivalent to '%s'", existingPath),
				Severity: ValidationWarning,
			})
		} else {
			normalizedPaths[normalized] = path
		}
	}
	
	// Check for version in path - this is a best practice but not required by OpenAPI spec
	for path := range doc.Paths.Map() {
		if !hasVersionInPath(path) {
			result.Issues = append(result.Issues, ValidationIssue{
				Path:     fmt.Sprintf("paths.%s", path),
				Rule:     "version-in-path",
				Message:  "Consider including API version in the path for better versioning",
				Severity: ValidationInfo, // This is a recommendation, not required
			})
		}
	}
}

// normalizePath replaces path parameters with a placeholder for comparison
func normalizePath(path string) string {
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		if strings.HasPrefix(segment, "{") && strings.HasSuffix(segment, "}") {
			segments[i] = "{param}"
		}
	}
	return strings.Join(segments, "/")
}

// hasVersionInPath checks if the path contains a version segment like /v1/
func hasVersionInPath(path string) bool {
	segments := strings.Split(path, "/")
	for _, segment := range segments {
		if len(segment) > 0 && segment[0] == 'v' {
			_, err := fmt.Sscanf(segment, "v%d", new(int))
			if err == nil {
				return true
			}
		}
	}
	return false
}

// validateOperations validates all operations in the OpenAPI document
func validateOperations(doc *openapi3.T, result *ValidationResult) {
	for path, pathItem := range doc.Paths.Map() {
		// Check for repeating path parameters (ibm-avoid-repeating-path-parameters)
		pathParams := make(map[string]bool)
		
		if pathItem.Parameters != nil {
			for _, param := range pathItem.Parameters {
				if param.Value != nil && param.Value.In == "path" {
					pathParams[param.Value.Name] = true
				}
			}
		}
		
		// Validate operations
		operations := map[string]*openapi3.Operation{
			"GET":     pathItem.Get,
			"POST":    pathItem.Post,
			"PUT":     pathItem.Put,
			"DELETE":  pathItem.Delete,
			"PATCH":   pathItem.Patch,
			"HEAD":    pathItem.Head,
			"OPTIONS": pathItem.Options,
			"TRACE":   pathItem.Trace,
		}
		
		for method, op := range operations {
			if op == nil {
				continue
			}
			
			opPath := fmt.Sprintf("paths.%s.%s", path, strings.ToLower(method))
			
			// Check for operation summary
			if op.Summary == "" {
				result.Issues = append(result.Issues, ValidationIssue{
					Path:     opPath,
					Rule:     "operation-summary",
					Message:  "Operation should have a summary",
					Severity: ValidationWarning,
				})
			}
			
			// Check for operation summary length
			if len(op.Summary) > 120 {
				result.Issues = append(result.Issues, ValidationIssue{
					Path:     opPath + ".summary",
					Rule:     "operation-summary-length",
					Message:  "Operation summary should be less than 120 characters",
					Severity: ValidationWarning,
				})
			}
			
			// Check for operation requestBody for GET, DELETE, etc. (ibm-no-operation-requestbody)
			if (method == "GET" || method == "DELETE" || method == "HEAD" || method == "OPTIONS") && op.RequestBody != nil {
				result.Issues = append(result.Issues, ValidationIssue{
					Path:     opPath + ".requestBody",
					Rule:     "http-method-semantics",
					Message:  fmt.Sprintf("%s operations should not have a requestBody according to HTTP semantics", method),
					Severity: ValidationWarning,
				})
			}
			
			// Check for repeating path parameters in operations
			for _, param := range op.Parameters {
				if param.Value != nil && param.Value.In == "path" && pathParams[param.Value.Name] {
					result.Issues = append(result.Issues, ValidationIssue{
						Path:     opPath + ".parameters",
						Rule:     "path-parameter-definition",
						Message:  fmt.Sprintf("Path parameter '%s' should be defined on the path level instead of the operation", param.Value.Name),
						Severity: ValidationWarning,
					})
				}
			}
		}
	}
}

// validateResponses validates all responses in the OpenAPI document
func validateResponses(doc *openapi3.T, result *ValidationResult) {
	for path, pathItem := range doc.Paths.Map() {
		operations := map[string]*openapi3.Operation{
			"GET":     pathItem.Get,
			"POST":    pathItem.Post,
			"PUT":     pathItem.Put,
			"DELETE":  pathItem.Delete,
			"PATCH":   pathItem.Patch,
		}
		
		for method, op := range operations {
			if op == nil || op.Responses == nil {
				continue
			}
			
			opPath := fmt.Sprintf("paths.%s.%s", path, strings.ToLower(method))
			
			// Check for operation responses - required by OpenAPI spec
			responseCount := 0
			for range op.Responses.Map() {
				responseCount++
			}
			
			if responseCount == 0 {
				result.Issues = append(result.Issues, ValidationIssue{
					Path:     opPath,
					Rule:     "operation-responses",
					Message:  "Operation must define at least one response",
					Severity: ValidationError, // This is required by OpenAPI spec
				})
			}
			
			// Check for array responses
			for status, respRef := range op.Responses.Map() {
				respPath := fmt.Sprintf("%s.responses.%s", opPath, status)
				
				if respRef.Value == nil {
					continue
				}
				
				for contentType, mediaType := range respRef.Value.Content {
					if mediaType.Schema == nil || mediaType.Schema.Value == nil {
						continue
					}
					
					mediaPath := fmt.Sprintf("%s.content.%s", respPath, contentType)
					schema := mediaType.Schema.Value
					
					schemaType := getPrimaryType(schema)
					if schemaType == "array" {
						result.Issues = append(result.Issues, ValidationIssue{
							Path:     mediaPath + ".schema",
							Rule:     "array-response",
							Message:  "Consider wrapping arrays in an object for better extensibility",
							Severity: ValidationWarning, // This is a best practice, not an error
						})
					}
				}
				
				// Check for error response schemas
				statusCode, err := strconvAtoi(status)
				if err == nil && statusCode >= 400 {
					// Check if error response has application/json content type
					if respRef.Value != nil {
						hasJsonContent := false
						for contentType := range respRef.Value.Content {
							if contentType == "application/json" {
								hasJsonContent = true
								break
							}
						}
						
						if !hasJsonContent {
							result.Issues = append(result.Issues, ValidationIssue{
								Path:     respPath,
								Rule:     "reusable-error-schema",
								Message:  "Consider using a reusable error schema in components.schemas",
								Severity: ValidationInfo,
							})
						}
					}
				}
			}
		}
	}
}

// strconvAtoi converts a string to an integer, ignoring errors
func strconvAtoi(s string) (int, error) {
	var i int
	_, err := fmt.Sscanf(s, "%d", &i)
	return i, err
}

// validateWebhooks validates webhooks in OpenAPI 3.1.0
func validateWebhooks(doc *openapi3.T, result *ValidationResult) {
	// In kin-openapi v0.132.0, Webhooks field is not directly accessible
	// We'll skip this check for now until we upgrade to a version that supports OpenAPI 3.1.0
	// This would be handled in OpenAPI 3.1.0 with proper support
	return
}
