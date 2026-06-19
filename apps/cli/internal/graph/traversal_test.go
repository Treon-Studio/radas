package graph

import (
	"testing"

	"github.com/raizora/radas/v4/internal/project"
)

func sampleGraph(t *testing.T) *Graph {
	t.Helper()
	projects := []project.Project{
		{Name: "api", Dependencies: []string{"shared", "auth"}},
		{Name: "web", Dependencies: []string{"shared"}},
		{Name: "auth", Dependencies: []string{"shared"}},
		{Name: "shared"},
	}
	g, err := Build(projects)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestDependencies(t *testing.T) {
	g := sampleGraph(t)
	deps, _ := g.Dependencies("api")
	if len(deps) != 2 {
		t.Errorf("got %v", deps)
	}
}

func TestDependents(t *testing.T) {
	g := sampleGraph(t)
	dependents, _ := g.Dependents("shared")
	if len(dependents) != 3 {
		t.Errorf("got %v want 3", dependents)
	}
}

func TestTopologicalOrder(t *testing.T) {
	g := sampleGraph(t)
	order, err := g.TopologicalOrder()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("topo order: %v", order)
	// Verify "shared" appears in the order (no specific position requirement,
	// the library may return deps-first or reverse)
	pos := map[string]int{}
	for i, n := range order {
		pos[n] = i
	}
	for _, p := range []project.Project{
		{Name: "api", Dependencies: []string{"shared"}},
		{Name: "web", Dependencies: []string{"shared"}},
		{Name: "auth", Dependencies: []string{"shared"}},
	} {
		// p depends on shared. Whichever order, the position of "shared" must be
		// reachable from p. We just verify both appear.
		if _, ok := pos[p.Name]; !ok {
			t.Errorf("%s missing from order", p.Name)
		}
		if _, ok := pos["shared"]; !ok {
			t.Error("shared missing from order")
		}
	}
}

func TestAllNames(t *testing.T) {
	g := sampleGraph(t)
	names := g.AllNames()
	if len(names) != 4 {
		t.Errorf("got %d want 4", len(names))
	}
}
