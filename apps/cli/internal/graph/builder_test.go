package graph

import (
	"testing"

	"github.com/raizora/radas/v4/internal/project"
)

func TestBuildSimple(t *testing.T) {
	projects := []project.Project{
		{Name: "api", Dependencies: []string{"shared"}},
		{Name: "shared"},
	}
	g, err := Build(projects)
	if err != nil {
		t.Fatal(err)
	}
	deps, _ := g.Dependencies("api")
	if len(deps) != 1 || deps[0] != "shared" {
		t.Errorf("got %v", deps)
	}
}

func TestBuildDuplicateName(t *testing.T) {
	projects := []project.Project{{Name: "api"}, {Name: "api"}}
	if _, err := Build(projects); err == nil {
		t.Error("expected error")
	}
}

func TestBuildRejectsCycle(t *testing.T) {
	projects := []project.Project{
		{Name: "a", Dependencies: []string{"b"}},
		{Name: "b", Dependencies: []string{"a"}},
	}
	g, err := Build(projects)
	if err != nil {
		// dominikbraun may catch some cycles at build time
		return
	}
	// Otherwise DetectCycles() should find them
	cycles, err := g.DetectCycles()
	if err == nil {
		t.Error("expected cycle detection")
	}
	if len(cycles) == 0 {
		t.Error("expected non-empty cycles")
	}
}
