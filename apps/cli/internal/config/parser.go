package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// RadasConfig represents the structure of radas.yml
type RadasConfig struct {
	Name        string   `yaml:"name"`
	Description string   `yaml:"description"`
	Type        string   `yaml:"type"`
	Stacks      []string `yaml:"stacks"`
	Contract    struct {
		Design []struct {
			Path string `yaml:"path"`
			Type string `yaml:"type"`
		} `yaml:"design"`
		API []struct {
			Path string `yaml:"path"`
			Type string `yaml:"type"`
		} `yaml:"api"`
	} `yaml:"contract"`
}

// ParseConfig reads and parses the radas.yml file
func ParseConfig(configPath string) (*RadasConfig, error) {
	// If configPath is a directory, look for radas.yml inside it
	if stat, err := os.Stat(configPath); err == nil && stat.IsDir() {
		configPath = filepath.Join(configPath, "radas.yml")
	}

	// Read the YAML file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse the YAML data
	var config RadasConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &config, nil
}

// FindConfig looks for radas.yml in the current directory and parent directories
func FindConfig() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("failed to get current directory: %w", err)
	}

	for {
		configPath := filepath.Join(dir, "radas.yml")
		if _, err := os.Stat(configPath); err == nil {
			return configPath, nil
		}

		// Stop if we're at the root directory
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", fmt.Errorf("radas.yml not found in current directory or any parent directory")
}

// ResolvePath resolves a path from the configuration file
// If the path starts with ${RADAS_PLAYGROUND}, it will be replaced with the value of the RADAS_PLAYGROUND environment variable
// Otherwise, the path is assumed to be relative to the configuration file's directory
func ResolvePath(basePath, configPath string) string {
	// Get the RADAS_PLAYGROUND environment variable
	playgroundDir := os.Getenv("RADAS_PLAYGROUND")
	
	// Replace ${RADAS_PLAYGROUND} with the actual value
	if strings.Contains(configPath, "${RADAS_PLAYGROUND}") && playgroundDir != "" {
		return strings.Replace(configPath, "${RADAS_PLAYGROUND}", playgroundDir, 1)
	}
	
	// If the path is absolute, return it as is
	if filepath.IsAbs(configPath) {
		return configPath
	}
	
	// If there's a playground directory and the path doesn't explicitly use it,
	// but we want to interpret all paths as relative to the playground
	if playgroundDir != "" {
		return filepath.Join(playgroundDir, configPath)
	}
	
	// Otherwise, interpret the path as relative to the config file's directory
	return filepath.Join(basePath, configPath)
}
