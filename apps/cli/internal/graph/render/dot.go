package render

import (
	"fmt"
	"strings"

	"github.com/raizora/radas/v4/internal/graph"
)

// colorForType returns the Graphviz fill color for a project type.
func colorForType(t string) string {
	switch t {
	case "backend-api", "backend-worker":
		return "#a3c4f3"
	case "frontend-web", "frontend-app":
		return "#b8e6b8"
	case "lib":
		return "#f3e5ab"
	case "design-tokens":
		return "#e6b8e6"
	case "infra-cloudflare":
		return "#f3b8a3"
	default:
		return "#dddddd"
	}
}

// DOT renders the graph as a Graphviz DOT string.
func DOT(g *graph.Graph) string {
	var sb strings.Builder
	sb.WriteString("digraph {\n")
	sb.WriteString("  rankdir=LR;\n")
	sb.WriteString("  node [shape=box, style=\"filled,rounded\"];\n")
	for _, name := range g.AllNames() {
		p, _ := g.Vertex(name)
		fmt.Fprintf(&sb, "  %q [label=%q, fillcolor=%q];\n", name, name, colorForType(p.Type))
	}
	for _, name := range g.AllNames() {
		deps, _ := g.Dependencies(name)
		for _, dep := range deps {
			fmt.Fprintf(&sb, "  %q -> %q;\n", name, dep)
		}
	}
	sb.WriteString("}\n")
	return sb.String()
}
