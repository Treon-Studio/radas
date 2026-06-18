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

// --- shared contract types ---------------------------------------------------

// ContractSource is a single design-token or API spec input.
type ContractSource struct {
	Path string `yaml:"path"`
	Type string `yaml:"type"`
}

// ContractConfig describes the design and API inputs the project consumes.
type ContractConfig struct {
	Design []ContractSource `yaml:"design,omitempty"`
	API    []ContractSource `yaml:"api,omitempty"`
}

// --- BE-specific types -------------------------------------------------------

// BuildConfig controls how the backend binary is built.
type BuildConfig struct {
	Main    string `yaml:"main,omitempty"`
	Output  string `yaml:"output,omitempty"`
	Ldflags string `yaml:"ldflags,omitempty"`
}

// DBConfig describes the database connection and migration paths.
type DBConfig struct {
	Driver     string `yaml:"driver,omitempty"`
	Migrations string `yaml:"migrations,omitempty"`
	Seeds      string `yaml:"seeds,omitempty"`
	DefaultDSN string `yaml:"default_dsn,omitempty"`
}

// GenTemplate is a single code-generator template mapping.
type GenTemplate struct {
	Template string `yaml:"template,omitempty"`
	Output   string `yaml:"output,omitempty"`
}

// GenConfig groups code-generation template paths.
type GenConfig struct {
	Handler *GenTemplate `yaml:"handler,omitempty"`
	Service *GenTemplate `yaml:"service,omitempty"`
	Model   *GenTemplate `yaml:"model,omitempty"`
}

// RunConfig controls how the dev server is started.
type RunConfig struct {
	// Command is the run command (e.g. "go run ./cmd/server").
	Command string `yaml:"command,omitempty"`
	// Watch enables hot-reload when true.
	Watch bool `yaml:"watch,omitempty"`
	// WatchTool is the hot-reload tool ("air", "gow", "reflex", "nodemon").
	WatchTool string `yaml:"watch_tool,omitempty"`
}

// ServerConfig holds dev-server defaults.
type ServerConfig struct {
	Port int `yaml:"port,omitempty"`
}

// TestConfig controls test-runner behaviour.
type TestConfig struct {
	CoverThreshold int    `yaml:"cover_threshold,omitempty"`
	Flags          string `yaml:"flags,omitempty"`
}

// FrontendConfig describes frontend-specific settings.
type FrontendConfig struct {
	Framework     string `yaml:"framework,omitempty"`
	Bundler       string `yaml:"bundler,omitempty"`
	Port          int    `yaml:"port,omitempty"`
	PackageManager string `yaml:"package_manager,omitempty"`
}

// BackendConfig describes backend-specific settings.
type BackendConfig struct {
	Framework string `yaml:"framework,omitempty"`
	Runtime   string `yaml:"runtime,omitempty"`
	Entry     string `yaml:"entry,omitempty"`
}

// DatabaseConfig describes ORM and database provider settings.
type DatabaseConfig struct {
	ORM      string `yaml:"orm,omitempty"`
	Config   string `yaml:"config,omitempty"`
	Provider string `yaml:"provider,omitempty"`
}

// DeployConfig describes deployment target settings.
type DeployConfig struct {
	Target   string `yaml:"target,omitempty"`
	Wrangler string `yaml:"wrangler,omitempty"`
}

// CloudflareConfig holds Cloudflare API credentials.
type CloudflareConfig struct {
	APIToken  string `yaml:"api_token,omitempty"`
	AccountID string `yaml:"account_id,omitempty"`
}

// GlobalConfig is the user-level config stored in ~/.config/radas/config.yml.
type GlobalConfig struct {
	Cloudflare CloudflareConfig `yaml:"cloudflare,omitempty"`
}

// RadasConfig represents the structure of radas.yml.
type RadasConfig struct {
	// Name is the human-readable project name.
	Name string `yaml:"name"`
	// Description is a one-line project summary.
	Description string `yaml:"description"`
	// Type is the project archetype (e.g. "backend-api", "frontend-web").
	Type string `yaml:"type"`
	// Stacks lists the technology stacks used (e.g. ["go", "gin"]).
	Stacks []string `yaml:"stacks"`

	// Contract describes the design and API inputs the project consumes.
	Contract ContractConfig `yaml:"contract"`

	// --- BE-specific ---------------------------------------------------------

	Build      BuildConfig      `yaml:"build,omitempty"`
	DB         DBConfig         `yaml:"db,omitempty"`
	Gen        GenConfig        `yaml:"gen,omitempty"`
	Server     ServerConfig     `yaml:"server,omitempty"`
	Test       TestConfig       `yaml:"test,omitempty"`
	Run        RunConfig        `yaml:"run,omitempty"`
	Cloudflare CloudflareConfig `yaml:"cloudflare,omitempty"`
	Frontend   FrontendConfig   `yaml:"frontend,omitempty"`
	Backend    BackendConfig    `yaml:"backend,omitempty"`
	Database   DatabaseConfig   `yaml:"database,omitempty"`
	Deploy     DeployConfig     `yaml:"deploy,omitempty"`
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

// LoadGlobalConfig loads the global radas config from ~/.config/radas/config.yml.
// Returns nil if the file does not exist.
func LoadGlobalConfig() (*GlobalConfig, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	globalPath := filepath.Join(homeDir, ".config", "radas", "config.yml")
	if _, err := os.Stat(globalPath); os.IsNotExist(err) {
		return nil, nil // no global config is fine
	}

	data, err := os.ReadFile(globalPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read global config: %w", err)
	}

	var cfg GlobalConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse global config: %w", err)
	}

	return &cfg, nil
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
