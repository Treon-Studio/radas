package render

import (
	"strings"
	"testing"

	"github.com/raizora/radas/v4/internal/graph"
	"github.com/raizora/radas/v4/internal/project"
)

func TestASCIILinear(t *testing.T) {
	projects := []project.Project{
		{Name: "api", Type: "backend-api", Dependencies: []string{"auth"}},
		{Name: "auth", Dependencies: []string{"shared"}},
		{Name: "shared"},
	}
	g, _ := graph.Build(projects)
	out := ASCII(g)
	for _, want := range []string{"api", "auth", "shared"} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in %s", want, out)
		}
	}
	if strings.Contains(out, "(*)") {
		t.Error("linear should not have cross-ref marker")
	}
}

func TestASCIIEmpty(t *testing.T) {
	// Empty graph
	g, _ := graph.Build(nil)
	out := ASCII(g)
	if !strings.Contains(out, "no projects") {
		t.Errorf("empty graph should say 'no projects', got %q", out)
	}
}
