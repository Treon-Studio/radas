package styles

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// StylesGenerator generates style variables from design tokens
type StylesGenerator struct {
	SourceDir  string
	OutputDir  string
	TypesToGen []string
}

// TokenData represents the structure of a design token file
type TokenData map[string]interface{}

// NewStylesGenerator creates a new styles generator
func NewStylesGenerator(sourceDir, outputDir string, typesToGen []string) *StylesGenerator {
	// Set default output directory if not provided
	if outputDir == "" {
		outputDir = "__generated/styles"
	}

	// Set default types if none provided
	if len(typesToGen) == 0 || (len(typesToGen) == 1 && typesToGen[0] == "all") {
		typesToGen = []string{"css", "scss", "less", "css-modules"}
	}

	return &StylesGenerator{
		SourceDir:  sourceDir,
		OutputDir:  outputDir,
		TypesToGen: typesToGen,
	}
}

// Generate generates all style variables based on configuration
func (g *StylesGenerator) Generate() error {
	// Create output directory if it doesn't exist
	if err := os.MkdirAll(g.OutputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Process foundation tokens
	foundationDir := filepath.Join(g.SourceDir, "foundation")
	foundationTokens, err := g.processTokensDirectory(foundationDir)
	if err != nil {
		return fmt.Errorf("failed to process foundation tokens: %w", err)
	}

	// Process component tokens
	componentsDir := filepath.Join(g.SourceDir, "components")
	componentTokens, err := g.processTokensDirectory(componentsDir)
	if err != nil {
		return fmt.Errorf("failed to process component tokens: %w", err)
	}

	// Generate files for each requested type
	for _, fileType := range g.TypesToGen {
		switch fileType {
		case "css":
			if err := g.generateCSS(foundationTokens, componentTokens); err != nil {
				return err
			}
		case "scss":
			if err := g.generateSCSS(foundationTokens, componentTokens); err != nil {
				return err
			}
		case "less":
			if err := g.generateLESS(foundationTokens, componentTokens); err != nil {
				return err
			}
		case "css-modules":
			if err := g.generateCSSModules(foundationTokens, componentTokens); err != nil {
				return err
			}
		}
	}

	fmt.Printf("✅ Successfully generated styles in %s\n", g.OutputDir)
	return nil
}

// processTokensDirectory reads all JSON files in a directory and returns a map of token data
func (g *StylesGenerator) processTokensDirectory(dir string) (map[string]TokenData, error) {
	tokens := make(map[string]TokenData)

	files, err := os.ReadDir(dir)
	if err != nil {
		// If directory doesn't exist, return empty tokens
		if os.IsNotExist(err) {
			return tokens, nil
		}
		return nil, err
	}

	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(dir, file.Name())
		fileData, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("failed to read token file %s: %w", filePath, err)
		}

		var tokenData TokenData
		if err := json.Unmarshal(fileData, &tokenData); err != nil {
			return nil, fmt.Errorf("failed to parse token file %s: %w", filePath, err)
		}

		// Use filename without extension as the token group name
		tokenName := strings.TrimSuffix(file.Name(), ".json")
		tokens[tokenName] = tokenData
	}

	return tokens, nil
}

// flattenTokens flattens nested token structures into a flat map with dot notation
func flattenTokens(prefix string, data interface{}, result map[string]interface{}) {
	switch v := data.(type) {
	case map[string]interface{}:
		for k, val := range v {
			// If this is a value object with type and value fields, extract just the value
			if valMap, ok := val.(map[string]interface{}); ok {
				if value, hasValue := valMap["value"]; hasValue {
					newKey := prefix
					if prefix != "" {
						newKey += "-"
					}
					newKey += k
					result[newKey] = value
					continue
				}
			}
			
			newPrefix := prefix
			if prefix != "" {
				newPrefix += "-"
			}
			newPrefix += k
			flattenTokens(newPrefix, val, result)
		}
	default:
		// If we get here, it's a leaf node that's not in the standard token format
		if prefix != "" {
			result[prefix] = v
		}
	}
}

// generateCSS generates CSS custom properties from tokens
func (g *StylesGenerator) generateCSS(foundationTokens, componentTokens map[string]TokenData) error {
	cssFile := filepath.Join(g.OutputDir, "variables.css")
	
	// Prepare variables content
	var sb strings.Builder
	sb.WriteString("/**\n")
	sb.WriteString(" * Design Tokens - CSS Variables\n")
	sb.WriteString(" * Generated with RADAS CLI\n")
	sb.WriteString(" */\n\n")
	
	// Root variables for light theme
	sb.WriteString(":root {\n")
	
	// Process foundation tokens first
	for categoryName, tokens := range foundationTokens {
		sb.WriteString(fmt.Sprintf("  /* %s */\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("  --%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	// Process component tokens
	for categoryName, tokens := range componentTokens {
		sb.WriteString(fmt.Sprintf("  /* %s Component */\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("  --%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	sb.WriteString("}\n\n")
	
	// Dark theme overrides
	sb.WriteString(".dark {\n")
	
	// Check for dark mode values in foundation tokens
	for _, tokens := range foundationTokens {
		if colorDark, ok := tokens["color-dark"]; ok {
			sb.WriteString("  /* Dark Theme Colors */\n")
			flatTokens := make(map[string]interface{})
			flattenTokens("color", colorDark, flatTokens)
			
			// Write the flattened tokens
			for key, value := range flatTokens {
				sb.WriteString(fmt.Sprintf("  --%s: %v;\n", key, value))
			}
			sb.WriteString("\n")
		}
	}
	
	// Additional dark mode overrides could be added here
	
	sb.WriteString("}\n")
	
	// Write the file
	return os.WriteFile(cssFile, []byte(sb.String()), 0644)
}

// generateSCSS generates SCSS variables from tokens
func (g *StylesGenerator) generateSCSS(foundationTokens, componentTokens map[string]TokenData) error {
	scssFile := filepath.Join(g.OutputDir, "variables.scss")
	
	// Prepare variables content
	var sb strings.Builder
	sb.WriteString("//\n")
	sb.WriteString("// Design Tokens - SCSS Variables\n")
	sb.WriteString("// Generated with RADAS CLI\n")
	sb.WriteString("//\n\n")
	
	// Define light theme variables
	sb.WriteString("// Light Theme\n")
	
	// Process foundation tokens first
	for categoryName, tokens := range foundationTokens {
		sb.WriteString(fmt.Sprintf("// %s\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("$%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	// Process component tokens
	for categoryName, tokens := range componentTokens {
		sb.WriteString(fmt.Sprintf("// %s Component\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("$%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	// Dark theme variables
	sb.WriteString("// Dark Theme\n")
	
	// Check for dark mode values in foundation tokens
	for _, tokens := range foundationTokens {
		if colorDark, ok := tokens["color-dark"]; ok {
			sb.WriteString("// Dark Theme Colors\n")
			flatTokens := make(map[string]interface{})
			flattenTokens("color-dark", colorDark, flatTokens)
			
			// Write the flattened tokens
			for key, value := range flatTokens {
				sb.WriteString(fmt.Sprintf("$%s: %v;\n", key, value))
			}
			sb.WriteString("\n")
		}
	}
	
	// Write the file
	return os.WriteFile(scssFile, []byte(sb.String()), 0644)
}

// generateLESS generates LESS variables from tokens
func (g *StylesGenerator) generateLESS(foundationTokens, componentTokens map[string]TokenData) error {
	lessFile := filepath.Join(g.OutputDir, "variables.less")
	
	// Prepare variables content
	var sb strings.Builder
	sb.WriteString("//\n")
	sb.WriteString("// Design Tokens - LESS Variables\n")
	sb.WriteString("// Generated with RADAS CLI\n")
	sb.WriteString("//\n\n")
	
	// Define light theme variables
	sb.WriteString("// Light Theme\n")
	
	// Process foundation tokens first
	for categoryName, tokens := range foundationTokens {
		sb.WriteString(fmt.Sprintf("// %s\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("@%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	// Process component tokens
	for categoryName, tokens := range componentTokens {
		sb.WriteString(fmt.Sprintf("// %s Component\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("@%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	// Dark theme variables
	sb.WriteString("// Dark Theme\n")
	
	// Check for dark mode values in foundation tokens
	for _, tokens := range foundationTokens {
		if colorDark, ok := tokens["color-dark"]; ok {
			sb.WriteString("// Dark Theme Colors\n")
			flatTokens := make(map[string]interface{})
			flattenTokens("color-dark", colorDark, flatTokens)
			
			// Write the flattened tokens
			for key, value := range flatTokens {
				sb.WriteString(fmt.Sprintf("@%s: %v;\n", key, value))
			}
			sb.WriteString("\n")
		}
	}
	
	// Write the file
	return os.WriteFile(lessFile, []byte(sb.String()), 0644)
}

// generateCSSModules generates CSS module variables from tokens
func (g *StylesGenerator) generateCSSModules(foundationTokens, componentTokens map[string]TokenData) error {
	cssModulesFile := filepath.Join(g.OutputDir, "variables.module.css")
	
	// Prepare variables content
	var sb strings.Builder
	sb.WriteString("/**\n")
	sb.WriteString(" * Design Tokens - CSS Modules\n")
	sb.WriteString(" * Generated with RADAS CLI\n")
	sb.WriteString(" */\n\n")
	
	// Root variables for light theme
	sb.WriteString(":root {\n")
	
	// Process foundation tokens first
	for categoryName, tokens := range foundationTokens {
		sb.WriteString(fmt.Sprintf("  /* %s */\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("  --%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	// Process component tokens
	for categoryName, tokens := range componentTokens {
		sb.WriteString(fmt.Sprintf("  /* %s Component */\n", strings.Title(categoryName)))
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens
		for key, value := range flatTokens {
			sb.WriteString(fmt.Sprintf("  --%s: %v;\n", key, value))
		}
		sb.WriteString("\n")
	}
	
	sb.WriteString("}\n\n")
	
	// Dark theme overrides
	sb.WriteString(".dark {\n")
	
	// Check for dark mode values in foundation tokens
	for _, tokens := range foundationTokens {
		if colorDark, ok := tokens["color-dark"]; ok {
			sb.WriteString("  /* Dark Theme Colors */\n")
			flatTokens := make(map[string]interface{})
			flattenTokens("color", colorDark, flatTokens)
			
			// Write the flattened tokens
			for key, value := range flatTokens {
				sb.WriteString(fmt.Sprintf("  --%s: %v;\n", key, value))
			}
			sb.WriteString("\n")
		}
	}
	
	sb.WriteString("}\n\n")
	
	// Export CSS Variables as JS variables for CSS Modules
	sb.WriteString("/* Exports for CSS Modules */\n")
	
	// Process foundation tokens
	for _, tokens := range foundationTokens {
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens as exports
		for key := range flatTokens {
			// Create camelCase version of key for JS
			parts := strings.Split(key, "-")
			for i := 1; i < len(parts); i++ {
				if len(parts[i]) > 0 {
					parts[i] = strings.ToUpper(parts[i][0:1]) + parts[i][1:]
				}
			}
			camelKey := strings.Join(parts, "")
			
			sb.WriteString(fmt.Sprintf(".%s {\n  composes: global(var(--%s));\n}\n", camelKey, key))
		}
	}
	
	// Process component tokens
	for _, tokens := range componentTokens {
		flatTokens := make(map[string]interface{})
		for key, value := range tokens {
			flattenTokens(key, value, flatTokens)
		}
		
		// Write the flattened tokens as exports
		for key := range flatTokens {
			// Create camelCase version of key for JS
			parts := strings.Split(key, "-")
			for i := 1; i < len(parts); i++ {
				if len(parts[i]) > 0 {
					parts[i] = strings.ToUpper(parts[i][0:1]) + parts[i][1:]
				}
			}
			camelKey := strings.Join(parts, "")
			
			sb.WriteString(fmt.Sprintf(".%s {\n  composes: global(var(--%s));\n}\n", camelKey, key))
		}
	}
	
	// Write the file
	return os.WriteFile(cssModulesFile, []byte(sb.String()), 0644)
}
