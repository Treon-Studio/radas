// Package config parses the project-level radas.yml file shared by every
// team command (frontend, backend, devops, design). It exposes the schema
// (RadasConfig), discovery (FindConfig), and path resolution (ResolvePath).
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// RadasConfig represents the structure of radas.yml.
type RadasConfig struct {
	// Name is the human-readable project name.
	Name string `yaml:"name"`
	// Description is a one-line project summary.
	Description string `yaml:"description"`
	// Type is the project archetype (e.g. "be", "fe", "infra").
	Type string `yaml:"type"`
	// Stacks lists the technology stacks used (e.g. ["go", "gin"]).
	Stacks []string `yaml:"stacks"`
	// Contract describes the design and API inputs the project consumes.
	Contract struct {
		// Design lists design-token input files.
		Design []struct {
			Path string `yaml:"path"`
			Type string `yaml:"type"`
		} `yaml:"design"`
		// API lists OpenAPI input specs.
		API []struct {
			Path string `yaml:"path"`
			Type string `yaml:"type"`
		} `yaml:"api"`
	} `yaml:"contract"`
}

// ParseConfig reads and parses the radas.yml file at configPath. If
// configPath is a directory, radas.yml inside it is used. Returns the
// parsed config or a wrapped error.
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

// FindConfig searches the current working directory and walks up parent
// directories looking for radas.yml. Returns the absolute path to the
// first match, or an error if none is found before the filesystem root.
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

// ResolvePath resolves configPath against basePath. Resolution order:
//  1. If configPath contains ${RADAS_PLAYGROUND} and the env var is set,
//     the placeholder is substituted with the env var value.
//  2. If configPath is absolute, it is returned unchanged.
//  3. If RADAS_PLAYGROUND is set, configPath is treated as relative to it.
//  4. Otherwise configPath is treated as relative to basePath.
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
