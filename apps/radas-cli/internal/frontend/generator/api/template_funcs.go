package api

import (
	"fmt"
	"strings"
	"regexp"

	"radas/internal/frontend/parser"
)

// Helper functions for templates
func schemaToZodTemplate(s parser.Schema) string {
	var props []string
	for k, t := range s.Properties {
		props = append(props, fmt.Sprintf("%s: %s", k, goTypeToZod(fmt.Sprintf("%v", t))))
	}
	return fmt.Sprintf("z.object({ %s }).partial().passthrough()", strings.Join(props, ", "))
}

func goTypeToTSType(propType interface{}) string {
	switch val := propType.(type) {
	case string:
		switch val {
		case "string":
			return "string"
		case "number":
			return "number"
		case "boolean":
			return "boolean"
		case "array":
			return "any[]"
		case "object":
			return "Record<string, any>"
		default:
			return "any"
		}
	case map[string]interface{}:
		if val["type"] == "array" {
			itemType := "any"
			if items, ok := val["items"].(string); ok {
				itemType = goTypeToTSType(items)
			}
			return fmt.Sprintf("%s[]", itemType)
		}
		return "Record<string, any>"
	default:
		return "any"
	}
}

func isRequired(propName string, required interface{}) bool {
	// Handle case where required might be nil or not a slice
	reqSlice, ok := required.([]string)
	if !ok {
		return false
	}
	
	for _, req := range reqSlice {
		if req == propName {
			return true
		}
	}
	return false
}

func hasErrorResponses(responses map[string]parser.Response) bool {
	for status := range responses {
		if isErrorStatus(status) {
			return true
		}
	}
	return false
}

func isErrorStatus(status string) bool {
	return status != "200" && status != "201" && status != "204"
}

func getResponseSchema(responses map[string]parser.Response) string {
	for status, resp := range responses {
		if !isErrorStatus(status) && resp.Schema != "" {
			return resp.Schema
		}
	}
	return "z.any()"
}

func hasParams(op parser.Operation) bool {
	return len(op.Parameters) > 0 || op.RequestBody != nil
}

func paramTypeTemplate(op parser.Operation) string {
	var result strings.Builder
	result.WriteString("{\n")
	
	for _, param := range op.Parameters {
		tsType := "any"
		if param.Schema != "z.any()" {
			if param.Schema == "z.string()" {
				tsType = "string"
			} else if param.Schema == "z.number()" {
				tsType = "number"
			} else if param.Schema == "z.boolean()" {
				tsType = "boolean"
			}
		}
		
		if param.Required {
			result.WriteString(fmt.Sprintf("  %s: %s;\n", param.Name, tsType))
		} else {
			result.WriteString(fmt.Sprintf("  %s?: %s;\n", param.Name, tsType))
		}
	}
	
	if op.RequestBody != nil {
		bodyType := "any"
		if op.RequestBody.Schema != "" && op.RequestBody.Schema != "z.any()" {
			if !strings.HasPrefix(op.RequestBody.Schema, "z.") {
				bodyType = op.RequestBody.Schema
			}
		}
		
		if op.RequestBody.Required {
			result.WriteString(fmt.Sprintf("  body: %s;\n", bodyType))
		} else {
			result.WriteString(fmt.Sprintf("  body?: %s;\n", bodyType))
		}
	}
	
	result.WriteString("}")
	return result.String()
}

func returnTypeTemplate(responses map[string]parser.Response) string {
	for _, resp := range responses {
		if resp.Schema != "" && resp.Schema != "z.any()" {
			schemaName := strings.TrimPrefix(strings.TrimSuffix(resp.Schema, "))"), "z.")
			if strings.HasPrefix(schemaName, "object") {
				return "Record<string, any>"
			} else if strings.HasPrefix(schemaName, "array") {
				return "any[]"
			} else {
				return schemaName
			}
		}
	}
	return "any"
}

func shouldInvalidateCache(op parser.Operation) bool {
	method := strings.ToUpper(op.Method)
	return method == "POST" || method == "PUT" || method == "PATCH" || method == "DELETE"
}

func actionName(method, id string) string {
	// Check if the ID already starts with the action verb
	lowerID := strings.ToLower(id)
	method = strings.ToLower(method)
	
	switch method {
	case "post":
		if strings.HasPrefix(lowerID, "create") {
			return id
		}
		return fmt.Sprintf("create%s", capitalize(id))
	case "put", "patch":
		if strings.HasPrefix(lowerID, "update") {
			return id
		}
		return fmt.Sprintf("update%s", capitalize(id))
	case "delete":
		if strings.HasPrefix(lowerID, "delete") || strings.HasPrefix(lowerID, "remove") {
			return id
		}
		return fmt.Sprintf("delete%s", capitalize(id))
	default:
		return id
	}
}

// extractTSType extracts a TypeScript type from a Zod schema
func extractTSType(schema string) string {
	if schema == "" || schema == "z.any()" {
		return "any"
	}
	
	// Match Zod type patterns
	if schema == "z.string()" {
		return "string"
	} else if schema == "z.number()" {
		return "number"
	} else if schema == "z.boolean()" {
		return "boolean"
	} else if strings.HasPrefix(schema, "z.array(") {
		// Extract the inner type
		inner := strings.TrimPrefix(schema, "z.array(")
		inner = strings.TrimSuffix(inner, ")")
		return extractTSType(inner) + "[]"
	} else if strings.HasPrefix(schema, "z.object(") {
		return "Record<string, any>"
	}
	
	// Try to extract a schema reference
	schemaName := extractDTOType(schema)
	if schemaName != "" {
		return schemaName
	}
	
	return "any"
}

// extractDTOType extracts a DTO type name from a schema reference
func extractDTOType(schema interface{}) string {
	// Handle nil schema
	if schema == nil {
		return "any"
	}
	
	// Convert to string if not already
	schemaStr, ok := schema.(string)
	if !ok {
		// Try to convert from a map
		schemaMap, mapOk := schema.(map[string]interface{})
		if mapOk {
			// Check for $ref which would be the reference to a schema
			if ref, hasRef := schemaMap["$ref"].(string); hasRef {
				// Extract the schema name from the reference (e.g., "#/components/schemas/User" -> "User")
				parts := strings.Split(ref, "/")
				if len(parts) > 0 {
					return parts[len(parts)-1]
				}
			}
			// Check for type
			if typeVal, hasType := schemaMap["type"].(string); hasType {
				if typeVal == "array" {
					// Handle array type
					if items, hasItems := schemaMap["items"].(map[string]interface{}); hasItems {
						itemType := extractDTOType(items)
						return itemType + "[]"
					}
					return "any[]"
				}
				return typeVal
			}
		}
		return "any"
	}
	
	// Handle Zod schema syntax
	if strings.HasPrefix(schemaStr, "z.") {
		// Try to extract schema name from complex patterns like z.UserSchema
		re := regexp.MustCompile(`z\.([A-Za-z0-9]+)Schema`)
		matches := re.FindStringSubmatch(schemaStr)
		if len(matches) > 1 {
			return matches[1]
		}
		
		// Handle basic Zod types
		if schemaStr == "z.string()" {
			return "string"
		} else if schemaStr == "z.number()" {
			return "number"
		} else if schemaStr == "z.boolean()" {
			return "boolean"
		} else if strings.HasPrefix(schemaStr, "z.array") {
			return "any[]"
		} else if strings.HasPrefix(schemaStr, "z.object") {
			return "Record<string, any>"
		}
		
		return "any"
	}
	
	// Handle direct reference to a schema name
	return schemaStr
}

// returnTypePromise returns the TypeScript type for a Promise returned by an API function
func returnTypePromise(responses map[string]parser.Response) string {
	for status, resp := range responses {
		if status == "200" || status == "201" || status == "204" {
			if resp.Schema != "" && resp.Schema != "z.any()" {
				schemaName := extractDTOType(resp.Schema)
				if schemaName != "" {
					return schemaName
				}
				
				// If not a named schema, determine basic type
				if strings.HasPrefix(resp.Schema, "z.array") {
					return "any[]"
				} else if resp.Schema == "z.string()" {
					return "string"
				} else if resp.Schema == "z.number()" {
					return "number"
				} else if resp.Schema == "z.boolean()" {
					return "boolean"
				}
			}
		}
	}

	return "any"
}

// shouldInvalidateQueries determines if queries should be invalidated for this operation
func shouldInvalidateQueries(op parser.Operation) bool {
	method := strings.ToUpper(op.Method)
	return method == "POST" || method == "PUT" || method == "PATCH" || method == "DELETE"
}

// hasRelatedGetOperation checks if there are GET operations related to this operation
func hasRelatedGetOperation(op parser.Operation, operations []parser.Operation) bool {
	// No entity, no related operations
	if op.Entity == "" {
		return false
	}
	
	// Look for GET operations with the same entity
	for _, otherOp := range operations {
		if strings.ToUpper(otherOp.Method) == "GET" && otherOp.Entity == op.Entity {
			return true
		}
	}
	
	return false
}

// getRelatedListOperation gets the related GET operation that returns a list
func getRelatedListOperation(op parser.Operation, operations []parser.Operation) string {
	// Get all GET operations with the same entity
	for _, otherOp := range operations {
		if strings.ToUpper(otherOp.Method) == "GET" && 
		   otherOp.Entity == op.Entity && 
		   !strings.Contains(otherOp.Path, "/{id}") { // Heuristic for list operation
			return otherOp.ID
		}
	}
	
	return ""
}

// getRelatedGetOperation gets the related GET operation that returns a single item
func getRelatedGetOperation(op parser.Operation, operations []parser.Operation) string {
	// Get all GET operations with the same entity
	for _, otherOp := range operations {
		if strings.ToUpper(otherOp.Method) == "GET" && 
		   otherOp.Entity == op.Entity && 
		   strings.Contains(otherOp.Path, "/{id}") { // Heuristic for get-by-id operation
			return otherOp.ID
		}
	}
	
	return ""
}

// pathWithParams formats a URL path replacing path params with JavaScript template syntax
func pathWithParams(path string) string {
	// Replace {param} with ${params.param}
	re := regexp.MustCompile(`\{([^}]+)\}`)
	result := re.ReplaceAllString(path, "${params.$1}")
	
	// If path was modified, wrap in backticks for template string
	if result != path {
		return "`" + result + "`"
	}
	
	return "'" + path + "'"
}

// getSuccessResponseSchema returns the schema for the successful response
func getSuccessResponseSchema(responses map[string]parser.Response) string {
	for status, resp := range responses {
		if status == "200" || status == "201" || status == "204" {
			if resp.Schema != "" {
				return resp.Schema
			}
		}
	}
	
	return ""
}

// hasPathParams checks if an operation has path parameters
func hasPathParams(op parser.Operation) bool {
	for _, param := range op.Parameters {
		if param.In == "path" {
			return true
		}
	}
	return false
}

// hasQueryParams checks if an operation has query parameters
func hasQueryParams(op parser.Operation) bool {
	for _, param := range op.Parameters {
		if param.In == "query" {
			return true
		}
	}
	return false
}
