package ai

import (
	"os"
	"testing"
)

func TestParseConfig(t *testing.T) {
	t.Setenv("OPENROUTER_KEY", "or-key")
	t.Setenv("OPENAI_KEY", "oai-key")

	yaml := `
default_provider: openrouter
providers:
  openrouter:
    model: deepseek/deepseek-chat
    api_key: $OPENROUTER_KEY
    base_url: https://openrouter.ai/api/v1
  openai:
    model: gpt-4o
    api_key: $OPENAI_KEY
cost_ceiling: 0.10
max_tool_iterations: 10
`
	cfg, err := ParseConfig([]byte(yaml))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultProvider != "openrouter" {
		t.Errorf("DefaultProvider = %q", cfg.DefaultProvider)
	}
	if cfg.CostCeiling != 0.10 {
		t.Errorf("CostCeiling = %f", cfg.CostCeiling)
	}
	if cfg.MaxToolIterations != 10 {
		t.Errorf("MaxToolIterations = %d", cfg.MaxToolIterations)
	}
	if len(cfg.Providers) != 2 {
		t.Errorf("got %d providers, want 2", len(cfg.Providers))
	}
	p := cfg.Providers["openrouter"]
	if p.Model != "deepseek/deepseek-chat" {
		t.Errorf("Model = %q", p.Model)
	}
}

func TestParseConfig_Defaults(t *testing.T) {
	cfg, err := ParseConfig([]byte(`default_provider: openai
providers:
  openai:
    api_key: key
`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CostCeiling != 0.10 {
		t.Errorf("CostCeiling = %f, want 0.10", cfg.CostCeiling)
	}
	if cfg.MaxToolIterations != 10 {
		t.Errorf("MaxToolIterations = %d, want 10", cfg.MaxToolIterations)
	}
}

func TestParseConfig_EnvVarResolution(t *testing.T) {
	t.Setenv("TEST_API_KEY", "secret-value-123")

	cfg, err := ParseConfig([]byte(`default_provider: test
providers:
  test:
    api_key: $TEST_API_KEY
`))
	if err != nil {
		t.Fatal(err)
	}
	p := cfg.Providers["test"]
	if p.APIKey != "secret-value-123" {
		t.Errorf("APIKey = %q, want %q", p.APIKey, "secret-value-123")
	}
}

func TestParseConfig_EnvVarMissing(t *testing.T) {
	t.Setenv("DEFINITELY_NOT_SET_XYZ", "")
	os.Unsetenv("DEFINITELY_NOT_SET_XYZ")

	_, err := ParseConfig([]byte(`default_provider: test
providers:
  test:
    api_key: $DEFINITELY_NOT_SET_XYZ
`))
	if err == nil {
		t.Error("expected error for missing env var")
	}
}
