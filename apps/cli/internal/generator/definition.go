package generator

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Definition struct {
	Name        string     `yaml:"name"`
	Description string     `yaml:"description"`
	Version     int        `yaml:"version"`
	Variables   []Variable `yaml:"variables"`
	Outputs     []Output   `yaml:"outputs"`
}

type Variable struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description,omitempty"`
	Prompt      string `yaml:"prompt,omitempty"`
	Default     string `yaml:"default,omitempty"`
	Type        string `yaml:"type,omitempty"`
	Validate    string `yaml:"validate,omitempty"`
}

type Output struct {
	Template string `yaml:"template"`
	Target   string `yaml:"target"`
}

func Parse(path string) (*Definition, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("generator: read %s: %w", path, err)
	}
	var def Definition
	if err := yaml.Unmarshal(data, &def); err != nil {
		return nil, fmt.Errorf("generator: parse %s: %w", path, err)
	}
	if def.Name == "" {
		return nil, fmt.Errorf("generator: template %s has no name", path)
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
