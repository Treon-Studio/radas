// Package graph: cycle detection.
//
// dominikbraun/graph's Acyclic() mode catches some cycles but is not exhaustive.
// DetectCycles() performs a manual DFS-based cycle detection that catches all cases.
package graph

import "fmt"

// DetectCycles returns the names of projects involved in any cycle, or nil
// if the graph is acyclic. Detection is O(V+E) via DFS with three-color marking.
func (g *Graph) DetectCycles() ([][]string, error) {
	adj, err := g.g.AdjacencyMap()
	if err != nil {
		return nil, err
	}

	const (
		white = 0 // unvisited
		gray  = 1 // in current DFS path
		black = 2 // fully processed
	)
	color := map[string]int{}
	for k := range adj {
		color[k] = white
	}

	var cycles [][]string
	var stack []string
	posInStack := map[string]int{}

	var visit func(name string) error
	visit = func(name string) error {
		color[name] = gray
		posInStack[name] = len(stack)
		stack = append(stack, name)

		for neighbor := range adj[name] {
			switch color[neighbor] {
			case white:
				if err := visit(neighbor); err != nil {
					return err
				}
			case gray:
				// Found a back-edge; neighbor is in current stack
				startIdx := posInStack[neighbor]
				cycle := append([]string{}, stack[startIdx:]...)
				cycle = append(cycle, neighbor) // close the cycle
				cycles = append(cycles, cycle)
			}
		}

		color[name] = black
		stack = stack[:len(stack)-1]
		delete(posInStack, name)
		return nil
	}

	for name := range adj {
		if color[name] == white {
			if err := visit(name); err != nil {
				return nil, err
			}
		}
	}
	if len(cycles) > 0 {
		return cycles, fmt.Errorf("graph has %d cycle(s)", len(cycles))
	}
	return nil, nil
}
