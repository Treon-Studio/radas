package runner

// Schedule groups TaskNodes into batches where each batch can run in
// parallel (no dependencies between tasks in the same batch). Uses Kahn's
// algorithm with layered BFS.
func Schedule(tasks []TaskNode) ([][]TaskNode, error) {
	id := func(p, t string) string { return p + "/" + t }

	// Pass 1: build the unique map first so all task IDs exist.
	unique := map[string]TaskNode{}
	for _, t := range tasks {
		unique[id(t.Project.Name, t.Task)] = t
	}

	// Pass 2: now that all task IDs are known, build deps.
	deps := map[string][]string{}
	for _, t := range tasks {
		i := id(t.Project.Name, t.Task)
		for _, depProj := range t.Project.Dependencies {
			upstreamId := id(depProj, t.Task)
			if _, ok := unique[upstreamId]; ok {
				deps[i] = append(deps[i], upstreamId)
			}
		}
	}

	inDegree := map[string]int{}
	for id := range unique {
		inDegree[id] = len(deps[id])
	}

	dependents := map[string][]string{}
	for to, fromList := range deps {
		for _, from := range fromList {
			dependents[from] = append(dependents[from], to)
		}
	}

	var batches [][]TaskNode
	queue := []string{}
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}
	for len(queue) > 0 {
		var currentBatch []TaskNode
		var nextQueue []string
		for _, id := range queue {
			currentBatch = append(currentBatch, unique[id])
		}
		batches = append(batches, currentBatch)
		for _, id := range queue {
			for _, dep := range dependents[id] {
				inDegree[dep]--
				if inDegree[dep] == 0 {
					nextQueue = append(nextQueue, dep)
				}
			}
		}
		queue = nextQueue
	}
	return batches, nil
}
