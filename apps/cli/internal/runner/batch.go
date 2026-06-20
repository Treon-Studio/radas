package runner

import (
	"fmt"
	"strconv"
	"sync"

	"github.com/raizora/radas/v4/internal/cache"
)

// RunBatch executes a batch of tasks in parallel with a semaphore.
// Returns all results in the same order as the input batch.
func RunBatch(batch []TaskNode, c *cache.LocalCache, opts ExecOptions, out interface{ Write([]byte) (int, error) }) []TaskResult {
	results := make([]TaskResult, len(batch))
	maxPar := opts.MaxParallel
	if maxPar < 1 {
		maxPar = 1
	}
	sem := make(chan struct{}, maxPar)
	var wg sync.WaitGroup
	for i, node := range batch {
		wg.Add(1)
		go func(idx int, n TaskNode) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			if out != nil {
				_, _ = out.Write([]byte(fmt.Sprintf("[%s/%s] starting\n", n.Project.Name, n.Task)))
			}

			res, _ := ExecuteTask(n, c, opts)
			results[idx] = res

			if out != nil {
				cacheStr := "miss"
				if res.CacheHit {
					cacheStr = "hit"
				}
				status := "ok"
				if res.Error != nil {
					status = "error: " + res.Error.Error()
				} else if res.ExitCode != 0 {
					status = "exit " + strconv.Itoa(res.ExitCode)
				}
				_, _ = out.Write([]byte(fmt.Sprintf("[%s/%s] %s (%s, %s)\n",
					n.Project.Name, n.Task, status, cacheStr, res.Duration.Round(1e6).String())))
			}
		}(i, node)
	}
	wg.Wait()
	return results
}
