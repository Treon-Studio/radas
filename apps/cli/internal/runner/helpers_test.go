package runner

import (
	"github.com/raizora/radas/v4/internal/project"
)

// projectWithDeps is a test helper.
func projectWithDeps(name string, deps []string) project.Project {
	return project.Project{Name: name, Dependencies: deps}
}
