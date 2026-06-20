package detector

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/project"
)

type RadasYMLDetector struct{}

func (RadasYMLDetector) Name() string { return "radasyml" }

func (RadasYMLDetector) Detect(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "radas.yml"))
	return err == nil
}

func (RadasYMLDetector) Extract(dir, rootPath string) (*project.Project, error) {
	cfg, err := config.ParseConfig(dir)
	if err != nil {
		return nil, fmt.Errorf("parse radas.yml: %w", err)
	}
	if cfg.Name == "" {
		return nil, fmt.Errorf("radas.yml in %s has no name", dir)
	}
	rel, err := filepath.Rel(rootPath, dir)
	if err != nil {
		return nil, err
	}
	return &project.Project{
		Name: cfg.Name,
		Type: cfg.Type,
		Path: filepath.ToSlash(rel),
	}, nil
}
