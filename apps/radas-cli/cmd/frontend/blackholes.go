package frontend

import (
	"fmt"
	"os"
	"path/filepath"
	"github.com/spf13/cobra"
)

// BlackholeCmd calculates the size of node_modules in all registered frontend apps (monorepo or single)
var removeFlag bool

var BlackholeCmd = &cobra.Command{
	Use:   "blackhole",
	Short: "Show size of all node_modules recursively from current folder",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Scanning for node_modules folders...")
		nmFolders := findAllNodeModules(".")
		if len(nmFolders) == 0 {
			fmt.Println("No node_modules folders found.")
			return
		}
		if removeFlag {
			fmt.Printf("WARNING: This will delete %d node_modules folders!\n", len(nmFolders))
			fmt.Print("Are you sure you want to continue? (y/N): ")
			var confirm string
			fmt.Scanln(&confirm)
			if confirm != "y" && confirm != "Y" {
				fmt.Println("Aborted.")
				return
			}
			for _, path := range nmFolders {
				fmt.Printf("Removing %s... ", path)
				err := os.RemoveAll(path)
				if err != nil {
					fmt.Printf("ERROR: %v\n", err)
				} else {
					fmt.Println("OK")
				}
			}
			fmt.Println("All node_modules folders removed.")
			return
		}
		total := int64(0)
		for _, path := range nmFolders {
			size := dirSize(path)
			fmt.Printf("%s: %s\n", path, formatSize(size))
			total += size
		}
		fmt.Printf("\nTotal node_modules size: %s\n", formatSize(total))
	},
}

func init() {
	BlackholeCmd.Flags().BoolVarP(&removeFlag, "remove", "r", false, "Remove all found node_modules folders after confirmation")
}

// findAllNodeModules recursively finds all node_modules folders from a root
func findAllNodeModules(root string) []string {
	var results []string
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && info.Name() == "node_modules" {
			results = append(results, path)
			// Skip walking inside node_modules itself
			return filepath.SkipDir
		}
		return nil
	})
	return results
}

func showNodeModulesSize(dir string) {
	size := dirSize(filepath.Join(dir, "node_modules"))
	fmt.Printf("node_modules: %s\n", formatSize(size))
}

// dirSize recursively sums the size of all files in a directory
func dirSize(path string) int64 {
	var size int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func formatSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(size)/float64(div), "KMGTPE"[exp])
}
