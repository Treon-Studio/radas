package detector

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/raizora/radas/v4/internal/workspace"
)

type NodeDetector struct{}

func (NodeDetector) Name() string { return "node" }

func (NodeDetector) Detect(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "package.json"))
	return err == nil
}

type packageJSON struct {
	Name string `json:"name"`
}

func (NodeDetector) Extract(dir, rootPath string) (*workspace.Project, error) {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("read package.json: %w", err)
	}
	var pkg packageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, fmt.Errorf("parse package.json: %w", err)
	}
	if pkg.Name == "" {
		return nil, fmt.Errorf("package.json in %s has no name", dir)
	}
	rel, err := filepath.Rel(rootPath, dir)
	if err != nil {
		return nil, err
	}
	return &workspace.Project{
		Name: pkg.Name,
		Type: "node",
		Path: filepath.ToSlash(rel),
	}, nil
}
