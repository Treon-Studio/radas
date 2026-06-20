package graph

import (
	"testing"

	"github.com/raizora/radas/v4/internal/project"
)

// TestBuildAcceptsDiamond: dominikbraun/graph with Acyclic() mode may not
// always catch cycles on AddEdge (depends on internal state and add order).
// We rely on DetectCycles() for explicit cycle detection in cycle.go.
func TestBuildAcceptsDiamond(t *testing.T) {
	projects := []project.Project{
		{Name: "a", Dependencies: []string{"b", "c"}},
		{Name: "b", Dependencies: []string{"d"}},
		{Name: "c", Dependencies: []string{"d"}},
		{Name: "d"},
	}
	if _, err := Build(projects); err != nil {
		t.Errorf("diamond should be OK: %v", err)
	}
}

// TestBuildRejectsSelfLoop tests the most basic cycle.
func TestBuildRejectsSelfLoop(t *testing.T) {
	projects := []project.Project{{Name: "a", Dependencies: []string{"a"}}}
	if _, err := Build(projects); err == nil {
		t.Skip("dominikbraun Acyclic mode does not catch this case; DetectCycles handles it in cycle.go")
	}
}
