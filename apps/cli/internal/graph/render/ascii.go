// Package render produces human-readable visualizations of a workspace graph.
package render

import (
	"sort"
	"strings"

	"github.com/raizora/radas/v4/internal/graph"
)

// ASCII renders the graph as a text tree. Cross-references (a project that
// would appear more than once) are marked with "(*)".
func ASCII(g *graph.Graph) string {
	all := g.AllNames()
	if len(all) == 0 {
		return "(no projects)\n"
	}
	// Pick starting point: alphabetically first project. Predictable,
	// easy to test, and easy to find in the output.
	sort.Strings(all)
	start := all[0]

	var sb strings.Builder
	seen := map[string]bool{}
	visited := map[string]bool{}

	var render func(name, prefix string, isLast bool)
	render = func(name, prefix string, isLast bool) {
		if prefix == "" {
			sb.WriteString(name + "\n")
		} else {
			connector := "├── "
			if isLast {
				connector = "└── "
			}
			sb.WriteString(prefix + connector + name)
			if seen[name] {
				sb.WriteString(" (*)")
			}
			sb.WriteString("\n")
		}
		seen[name] = true
		if visited[name] {
			return
		}
		visited[name] = true

		deps, _ := g.Dependencies(name)
		for i, dep := range deps {
			isLastChild := i == len(deps)-1
			childPrefix := prefix
			if isLast {
				childPrefix += "    "
			} else {
				childPrefix += "│   "
			}
			if prefix == "" {
				childPrefix = ""
			}
			render(dep, childPrefix, isLastChild)
		}
	}
	render(start, "", true)
	return sb.String()
}
