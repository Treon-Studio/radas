package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseConfig(t *testing.T) {
	content := `
name: test-project
type: be
stacks: [go, gin]
`
	tmpDir, _ := os.MkdirTemp("", "radas-test-*")
	defer os.RemoveAll(tmpDir)
	
	cfgPath := filepath.Join(tmpDir, "radas.yml")
	os.WriteFile(cfgPath, []byte(content), 0644)
	
	cfg, err := ParseConfig(cfgPath)
	if err != nil {
		t.Fatalf("ParseConfig failed: %v", err)
	}
	
	if cfg.Name != "test-project" {
		t.Errorf("Expected name test-project, got %s", cfg.Name)
	}
}

func TestResolvePath(t *testing.T) {
    // Clear playground env for clean test
    os.Setenv("RADAS_PLAYGROUND", "")
    
	base := "/app"
	rel := "src/main.go"
	got := ResolvePath(base, rel)
	want := filepath.Join(base, rel)
	if got != want {
		t.Errorf("ResolvePath relative = %s, want %s", got, want)
	}
}
