package ai

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type AIConfig struct {
	DefaultProvider   string                    `yaml:"default_provider"`
	Providers         map[string]ProviderConfig `yaml:"providers"`
	CostCeiling       float64                   `yaml:"cost_ceiling"`
	MaxToolIterations int                       `yaml:"max_tool_iterations"`
}

type ProviderConfig struct {
	Model   string `yaml:"model"`
	APIKey  string `yaml:"api_key"`
	BaseURL string `yaml:"base_url"`
}

func ParseConfig(data []byte) (*AIConfig, error) {
	var cfg AIConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse ai config: %w", err)
	}
	if cfg.CostCeiling == 0 {
		cfg.CostCeiling = 0.10
	}
	if cfg.MaxToolIterations == 0 {
		cfg.MaxToolIterations = 10
	}

	for name, p := range cfg.Providers {
		if strings.HasPrefix(p.APIKey, "$") {
			envVar := strings.TrimPrefix(p.APIKey, "$")
			p.APIKey = os.Getenv(envVar)
			cfg.Providers[name] = p
		}
	}

	return &cfg, nil
}
