package config

import (
	"github.com/raizora/radas/v4/internal/config"
	"os"
	"path/filepath"
	"testing"
)

func TestFindRadasConfigInProject(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "radas-integration-*")
	defer os.RemoveAll(tmpDir)

	oldWd, _ := os.Getwd()
	os.Chdir(tmpDir)
	defer os.Chdir(oldWd)

	os.WriteFile("radas.yml", []byte("name: integration"), 0644)

	got, err := config.FindConfig()
	if err != nil {
		t.Fatalf("FindConfig failed: %v", err)
	}

	// Use Base to compare as got is absolute
	if filepath.Base(got) != "radas.yml" {
		t.Errorf("Expected radas.yml, got %s", got)
	}
}
