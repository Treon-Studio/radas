package workspace

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/cache"
)

func defaultCacheDir() string {
	home := os.Getenv("HOME")
	if home == "" {
		home = os.TempDir()
	}
	return filepath.Join(home, ".radas", "cache")
}

func runCacheStatus(cmd *cobra.Command) error {
	dir := defaultCacheDir()
	c := cache.NewLocalCache(dir)
	size, _ := c.Size()
	count, _ := c.Count()
	t := table.NewWriter()
	t.SetOutputMirror(cmd.OutOrStdout())
	t.AppendHeader(table.Row{"METRIC", "VALUE"})
	t.AppendRow(table.Row{"Cache directory", dir})
	t.AppendRow(table.Row{"Entries", count})
	t.AppendRow(table.Row{"Size (bytes)", size})
	t.AppendRow(table.Row{"Size (KB)", fmt.Sprintf("%.2f", float64(size)/1024)})
	t.SetStyle(table.StyleLight)
	t.Render()
	return nil
}

func runCacheClear(cmd *cobra.Command) error {
	dir := defaultCacheDir()
	c := cache.NewLocalCache(dir)
	count, _ := c.Count()
	if err := c.Prune(); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Cleared %d cache entries from %s\n", count, dir)
	return nil
}
