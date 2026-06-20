package runner

import (
	"fmt"
	"time"

	"github.com/jedib0t/go-pretty/v6/table"
)

// PrintSummary prints a summary table of all task results.
func PrintSummary(results []TaskResult, w interface{ Write([]byte) (int, error) }) {
	t := table.NewWriter()
	t.SetOutputMirror(w)
	t.AppendHeader(table.Row{"PROJECT", "TASK", "STATUS", "DURATION", "CACHE"})
	for _, r := range results {
		status := "OK"
		if r.Error != nil {
			status = "ERROR"
		} else if r.ExitCode != 0 {
			status = fmt.Sprintf("EXIT %d", r.ExitCode)
		}
		cacheStr := "-"
		if r.CacheHit {
			cacheStr = "HIT"
		}
		t.AppendRow(table.Row{
			r.Node.Project.Name,
			r.Node.Task,
			status,
			r.Duration.Round(time.Millisecond).String(),
			cacheStr,
		})
	}
	t.SetStyle(table.StyleLight)
	t.Render()
}
