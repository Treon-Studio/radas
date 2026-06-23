package radas

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	cfg "github.com/raizora/radas/v4/internal/config"
)

var configPaths = []string{
	"./radas.yaml",
	"./.radas/radas.yaml",
	"./.radas/radas.yml",
}

type RADASConfig struct {
	Version string      `yaml:"version"`
	Project string      `yaml:"project"`
	Model   ModelConfig `yaml:"model"`
	MCP     MCPConfig   `yaml:"mcp"`
}

type ModelConfig struct {
	Provider    string  `yaml:"provider"`
	Name        string  `yaml:"name"`
	Temperature float64 `yaml:"temperature"`
}

type MCPConfig struct {
	Servers map[string]ServerEntry `yaml:"servers"`
}

type ServerEntry struct {
	Command string            `yaml:"command"`
	Args    []string          `yaml:"args"`
	Env     map[string]string `yaml:"env"`
}

type DetectionResult struct {
	Detected bool
	Path     string
	Version  string
	Valid    bool
	Error    error
}

func Detect() DetectionResult {
	for _, p := range configPaths {
		expanded := expandPath(p)
		if _, err := os.Stat(expanded); err == nil {
			version, valid, parseErr := parseConfig(expanded)
			return DetectionResult{
				Detected: true,
				Path:     expanded,
				Version:  version,
				Valid:    valid,
				Error:    parseErr,
			}
		}
	}

	if path, err := cfg.FindConfig(); err == nil {
		parsed, parseErr := cfg.ParseConfig(path)
		if parseErr != nil {
			return DetectionResult{
				Detected: true,
				Path:     path,
				Valid:    false,
				Error:    parseErr,
			}
		}
		version := parsed.Name
		if version == "" {
			version = "unknown"
		}
		return DetectionResult{
			Detected: true,
			Path:     path,
			Version:  version,
			Valid:    parsed.Name != "",
		}
	}

	return DetectionResult{Detected: false}
}

func parseConfig(path string) (string, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false, err
	}

	var config RADASConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return "", false, err
	}

	valid := config.Version != "" && config.Project != ""
	return config.Version, valid, nil
}

func expandPath(path string) string {
	if len(path) > 0 && path[0] == '~' {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, path[1:])
		}
	}

	if len(path) > 1 && path[0] == '$' {
		end := 1
		for end < len(path) && isAlphaNum(path[end]) {
			end++
		}
		env := os.Getenv(path[1:end])
		if env != "" {
			return filepath.Join(env, path[end:])
		}
	}

	return path
}

func isAlphaNum(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
}

func DetectMCPServers() ([]string, error) {
	for _, p := range configPaths {
		expanded := expandPath(p)
		data, err := os.ReadFile(expanded)
		if err != nil {
			continue
		}

		var config RADASConfig
		if err := yaml.Unmarshal(data, &config); err != nil {
			continue
		}

		var servers []string
		for name := range config.MCP.Servers {
			servers = append(servers, name)
		}
		return servers, nil
	}

	return nil, fmt.Errorf("no radas config found")
}
