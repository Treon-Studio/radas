package workspace

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	"github.com/raizora/radas/v4/internal/project"
)

// projectLocalDeps is the optional per-project dependency block we read from
// radas.yml. Defined inline (not in internal/config) to avoid coupling the
// single-project config schema to workspace concepts. The block looks like:
//
//	workspace:
//	  depends_on:
//	    - shared-types
//	    - auth-service
type projectLocalDeps struct {
	Workspace *struct {
		DependsOn []string `yaml:"depends_on,omitempty"`
	} `yaml:"workspace,omitempty"`
}

// ParseDeps extracts the list of internal-workspace project names that p
// depends on, by reading p's radas.yml. Unknown references are filtered.
func ParseDeps(p *project.Project, allProjects []project.Project, root string) ([]string, error) {
	if p.Path == "" {
		return nil, nil
	}
	radasPath := filepath.Join(root, filepath.FromSlash(p.Path), "radas.yml")
	data, err := os.ReadFile(radasPath)
	if err != nil {
		return nil, nil
	}
	var local projectLocalDeps
	if err := yaml.Unmarshal(data, &local); err != nil {
		return nil, fmt.Errorf("parse %s: %w", radasPath, err)
	}
	if local.Workspace == nil {
		return nil, nil
	}
	known := map[string]bool{}
	for _, other := range allProjects {
		known[other.Name] = true
	}
	var deps []string
	for _, name := range local.Workspace.DependsOn {
		if known[name] == false || name == p.Name {
			continue
		}
		deps = append(deps, name)
	}
	return deps, nil
}
