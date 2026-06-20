package ai

import (
	"fmt"
	"os"

	"github.com/raizora/radas/v4/internal/config"
	"gopkg.in/yaml.v3"
)

func LoadAIConfigFromRadasYML() (*AIConfig, error) {
	configPath, err := config.FindConfig()
	if err != nil {
		return nil, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("read radas.yml: %w", err)
	}

	var raw map[string]any
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse radas.yml: %w", err)
	}

	aiSection, ok := raw["ai"]
	if !ok {
		return nil, nil
	}

	aiYAML, err := yaml.Marshal(aiSection)
	if err != nil {
		return nil, fmt.Errorf("marshal ai section: %w", err)
	}

	aiCfg, err := ParseConfig(aiYAML)
	if err != nil {
		return nil, fmt.Errorf("parse ai config: %w", err)
	}

	return aiCfg, nil
}
