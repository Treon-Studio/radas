package generator

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Definition describes a code generation template definition read from YAML.
type Definition struct {
	Name        string     `yaml:"name"`
	Description string     `yaml:"description"`
	Version     int        `yaml:"version"`
	Variables   []Variable `yaml:"variables"`
	Outputs     []Output   `yaml:"outputs"`
}

// Variable describes a single user-input variable for a template.
type Variable struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description,omitempty"`
	Prompt      string `yaml:"prompt,omitempty"`
	Default     string `yaml:"default,omitempty"`
	Type        string `yaml:"type,omitempty"`
	Validate    string `yaml:"validate,omitempty"`
}

// Output describes a single generated file output from a template.
type Output struct {
	Template string `yaml:"template"`
	Target   string `yaml:"target"`
}

// Parse reads a YAML definition file, validates required fields, and applies
// defaults for optional fields (Version defaults to 1, Variable.Type defaults
// to "string").
func Parse(path string) (*Definition, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read template: %w", err)
	}
	var def Definition
	if err := yaml.Unmarshal(data, &def); err != nil {
		return nil, fmt.Errorf("parse template: %w", err)
	}
	if def.Name == "" {
		return nil, fmt.Errorf("template %s has no name", path)
	}
	if def.Version == 0 {
		def.Version = 1
	}
	for i := range def.Variables {
		if def.Variables[i].Type == "" {
			def.Variables[i].Type = "string"
		}
	}
	return &def, nil
}
