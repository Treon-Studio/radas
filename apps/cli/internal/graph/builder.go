// Package graph builds and queries a directed acyclic graph of workspace projects.
package graph

import (
	"fmt"

	dgraph "github.com/dominikbraun/graph"
	"github.com/raizora/radas/v4/internal/project"
)

// Graph is a directed acyclic graph of projects. Edges go from a project to
// the projects it depends on (e.g. api -> shared-types means api depends on
// shared-types).
type Graph struct {
	g dgraph.Graph[string, project.Project]
}

// Build constructs a graph from a slice of projects. Returns an error on
// duplicate names or cycles (caught by dominikbraun Acyclic mode).
func Build(projects []project.Project) (*Graph, error) {
	g := dgraph.New(
		func(p project.Project) string { return p.Name },
		dgraph.Directed(),
		dgraph.Acyclic(),
	)
	for _, p := range projects {
		err := g.AddVertex(p)
		if err != nil {
			return nil, fmt.Errorf("add vertex %q: %w", p.Name, err)
		}
	}
	for _, p := range projects {
		for _, dep := range p.Dependencies {
			err := g.AddEdge(p.Name, dep)
			if err != nil {
				return nil, fmt.Errorf("add edge %s -> %s: %w", p.Name, dep, err)
			}
		}
	}
	return &Graph{g: g}, nil
}

// Vertex returns the Project stored at the given name.
func (g *Graph) Vertex(name string) (project.Project, error) {
	return g.g.Vertex(name)
}
