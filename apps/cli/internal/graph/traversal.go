package graph

import (
	"sort"

	dgraph "github.com/dominikbraun/graph"
)

// Dependencies returns the names of projects that name directly depends on.
func (g *Graph) Dependencies(name string) ([]string, error) {
	adj, err := g.g.AdjacencyMap()
	if err != nil {
		return nil, err
	}
	out := adj[name]
	names := make([]string, 0, len(out))
	for k := range out {
		names = append(names, k)
	}
	sort.Strings(names)
	return names, nil
}

// Dependents returns the names of projects that directly depend on name.
func (g *Graph) Dependents(name string) ([]string, error) {
	pred, err := g.g.PredecessorMap()
	if err != nil {
		return nil, err
	}
	var deps []string
	for k := range pred[name] {
		deps = append(deps, k)
	}
	sort.Strings(deps)
	return deps, nil
}

// TopologicalOrder returns project names in an order such that every project
// appears after all of its dependencies.
func (g *Graph) TopologicalOrder() ([]string, error) {
	return dgraph.TopologicalSort(g.g)
}

// AllNames returns all project names in the graph, sorted.
func (g *Graph) AllNames() []string {
	adj, err := g.g.AdjacencyMap()
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(adj))
	for k := range adj {
		names = append(names, k)
	}
	sort.Strings(names)
	return names
}

// AdjacencyMap returns the raw adjacency map for advanced use.
func (g *Graph) AdjacencyMap() (map[string]map[string]dgraph.Edge[string], error) {
	return g.g.AdjacencyMap()
}
