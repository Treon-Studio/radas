package workspace

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/bmatcuk/doublestar/v4"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/project"
	"github.com/raizora/radas/v4/internal/workspace/detector"
)

// Scan walks the workspace rooted at root, applies the project patterns in
// cfg.Projects to find candidate directories, runs the detector registry on
// each candidate, and returns the discovered projects.
func Scan(root string, cfg *config.WorkspaceConfig) ([]project.Project, error) {
	registry := detector.NewRegistry()
	registry.Register(detector.RadasYMLDetector{}, detector.GoDetector{}, detector.NodeDetector{})

	var projects []project.Project
	seen := map[string]bool{}
	for _, pattern := range cfg.Projects {
		matches, err := doublestar.Glob(os.DirFS(root), pattern)
		if err != nil {
			return nil, fmt.Errorf("glob %q: %w", pattern, err)
		}
		for _, m := range matches {
			abs := filepath.Join(root, m)
			info, err := os.Stat(abs)
			if err != nil || info.IsDir() == false {
				continue
			}
			if isExcluded(abs, root, cfg.Exclude) {
				continue
			}
			p, err := registry.Detect(abs, root)
			if err != nil {
				continue
			}
			if seen[p.Name] {
				continue
			}
			seen[p.Name] = true
			projects = append(projects, *p)
		}
	}
	return projects, nil
}

func isExcluded(absPath, root string, patterns []string) bool {
	rel, err := filepath.Rel(root, absPath)
	if err != nil {
		return false
	}
	rel = filepath.ToSlash(rel)
	for _, pat := range patterns {
		matched, _ := doublestar.PathMatch(pat, rel)
		if matched {
			return true
		}
		parent := absPath
		for {
			parent = filepath.Dir(parent)
			if parent == root || parent == "." || parent == "/" {
				break
			}
			prel, _ := filepath.Rel(root, parent)
			prel = filepath.ToSlash(prel)
			matched, _ := doublestar.PathMatch(pat, prel)
			if matched {
				return true
			}
		}
	}
	return false
}
