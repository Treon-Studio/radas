package workspace

import "github.com/spf13/cobra"

var cacheCmd = &cobra.Command{
	Use:   "cache",
	Short: "Manage the local task cache",
}

var cacheStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show cache size and entry count",
	RunE:  func(cmd *cobra.Command, args []string) error { return runCacheStatus(cmd) },
}

var cacheClearCmd = &cobra.Command{
	Use:   "clear",
	Short: "Remove all cache entries",
	RunE:  func(cmd *cobra.Command, args []string) error { return runCacheClear(cmd) },
}

func init() {
	cacheCmd.AddCommand(cacheStatusCmd, cacheClearCmd)
}
