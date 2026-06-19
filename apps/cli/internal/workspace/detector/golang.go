package detector

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/mod/modfile"

	"github.com/raizora/radas/v4/internal/workspace"
)

// Go detects Go projects by go.mod. The module path from go.mod becomes the
// project name (e.g. "example.com/billing") so internal Go imports can be
// matched against it during dependency parsing.
type GoDetector struct{}

func (GoDetector) Name() string { return "go" }

func (GoDetector) Detect(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "go.mod"))
	return err == nil
}

func (GoDetector) Extract(dir, rootPath string) (*workspace.Project, error) {
	data, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	if err != nil {
		return nil, fmt.Errorf("read go.mod: %w", err)
	}
	mf, err := modfile.Parse("go.mod", data, nil)
	if err != nil {
		return nil, fmt.Errorf("parse go.mod: %w", err)
	}
	if mf.Module == nil || mf.Module.Mod.Path == "" {
		return nil, fmt.Errorf("go.mod in %s has no module path", dir)
	}
	rel, err := filepath.Rel(rootPath, dir)
	if err != nil {
		return nil, err
	}
	return &workspace.Project{
		Name: mf.Module.Mod.Path,
		Type: "go",
		Path: filepath.ToSlash(rel),
	}, nil
}
