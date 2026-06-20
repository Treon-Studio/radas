package render

import (
	"strings"
	"testing"

	"github.com/raizora/radas/v4/internal/graph"
	"github.com/raizora/radas/v4/internal/project"
)

func TestDOT(t *testing.T) {
	projects := []project.Project{
		{Name: "api", Type: "backend-api", Dependencies: []string{"shared"}},
		{Name: "shared", Type: "lib"},
	}
	g, _ := graph.Build(projects)
	out := DOT(g)
	if !strings.HasPrefix(out, "digraph {") {
		t.Error("must start with digraph {")
	}
	if !strings.Contains(out, `"api" -> "shared"`) {
		t.Error("missing edge")
	}
}
