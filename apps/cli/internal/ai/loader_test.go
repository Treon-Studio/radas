package ai

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAIConfigFromRadasYML_NoFile(t *testing.T) {
	tmpDir := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	cfg, err := LoadAIConfigFromRadasYML()
	if err != nil {
		t.Fatal(err)
	}
	if cfg != nil {
		t.Error("expected nil config when no radas.yml")
	}
}

func TestLoadAIConfigFromRadasYML_NoAISection(t *testing.T) {
	tmpDir := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	if err := os.WriteFile(filepath.Join(tmpDir, "radas.yml"), []byte(`
metadata:
  version: 1
`), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadAIConfigFromRadasYML()
	if err != nil {
		t.Fatal(err)
	}
	if cfg != nil {
		t.Error("expected nil config when no ai: section")
	}
}

func TestLoadAIConfigFromRadasYML_WithAI(t *testing.T) {
	tmpDir := t.TempDir()
	oldWd, _ := os.Getwd()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(oldWd) })

	yml := `
metadata:
  version: 1
ai:
  default_provider: openrouter
  providers:
    openrouter:
      model: deepseek/deepseek-chat
      api_key: $TEST_KEY
  cost_ceiling: 0.10
`
	if err := os.WriteFile(filepath.Join(tmpDir, "radas.yml"), []byte(yml), 0644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("TEST_KEY", "secret-value")

	cfg, err := LoadAIConfigFromRadasYML()
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.DefaultProvider != "openrouter" {
		t.Errorf("DefaultProvider = %q", cfg.DefaultProvider)
	}
	if cfg.Providers["openrouter"].Model != "deepseek/deepseek-chat" {
		t.Errorf("Model = %q", cfg.Providers["openrouter"].Model)
	}
}
