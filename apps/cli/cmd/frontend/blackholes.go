package frontend

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
)

// BlackholeCmd calculates the size of node_modules in all registered frontend apps (monorepo or single)
var removeFlag bool

var BlackholeCmd = &cobra.Command{
	Use:   "blackhole",
	Short: "Show size of all node_modules recursively from current folder",
	Long: `Show size of all node_modules folders recursively from current folder.

After displaying the list, you can choose to delete specific node_modules interactively.
Use --remove flag to delete ALL node_modules without interactive selection.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Scanning for node_modules folders...")
		nmFolders := findAllNodeModules(".")
		if len(nmFolders) == 0 {
			fmt.Println("No node_modules folders found.")
			return
		}

		// Calculate sizes and display
		folderSizes := make(map[string]int64)
		total := int64(0)
		for _, path := range nmFolders {
			size := dirSize(path)
			folderSizes[path] = size
			fmt.Printf("%s: %s\n", path, formatSize(size))
			total += size
		}
		fmt.Printf("\nTotal node_modules size: %s\n", formatSize(total))

		// If --remove flag is set, remove all without interactive selection
		if removeFlag {
			fmt.Printf("\nWARNING: This will delete %d node_modules folders!\n", len(nmFolders))
			fmt.Print("Are you sure you want to continue? (y/N): ")
			var confirm string
			fmt.Scanln(&confirm)
			if confirm != "y" && confirm != "Y" {
				fmt.Println("Aborted.")
				return
			}
			removeNodeModules(nmFolders)
			return
		}

		// Interactive deletion prompt
		promptDeleteNodeModules(nmFolders, folderSizes)
	},
}

// promptDeleteNodeModules asks user if they want to delete any node_modules and lets them select which ones
func promptDeleteNodeModules(nmFolders []string, folderSizes map[string]int64) {
	fmt.Println()

	// Ask if user wants to delete any
	var wantDelete bool
	confirmPrompt := &survey.Confirm{
		Message: "Do you want to delete any node_modules?",
		Default: false,
	}
	err := survey.AskOne(confirmPrompt, &wantDelete)
	if err != nil || !wantDelete {
		return
	}

	// Build options with size info
	options := make([]string, len(nmFolders))
	for i, path := range nmFolders {
		options[i] = fmt.Sprintf("%s (%s)", path, formatSize(folderSizes[path]))
	}

	// Multi-select prompt
	var selectedOptions []string
	selectPrompt := &survey.MultiSelect{
		Message: "Select node_modules to delete (space to select, enter to confirm):",
		Options: options,
	}
	err = survey.AskOne(selectPrompt, &selectedOptions)
	if err != nil {
		fmt.Println("Selection cancelled.")
		return
	}

	if len(selectedOptions) == 0 {
		fmt.Println("No folders selected.")
		return
	}

	// Extract paths from selected options (remove size info)
	selectedPaths := make([]string, len(selectedOptions))
	for i, opt := range selectedOptions {
		// Find matching path
		for _, path := range nmFolders {
			expected := fmt.Sprintf("%s (%s)", path, formatSize(folderSizes[path]))
			if opt == expected {
				selectedPaths[i] = path
				break
			}
		}
	}

	// Calculate total size to be freed
	var totalToFree int64
	for _, path := range selectedPaths {
		totalToFree += folderSizes[path]
	}

	// Final confirmation
	fmt.Printf("\nYou are about to delete %d folder(s), freeing %s\n", len(selectedPaths), formatSize(totalToFree))
	var finalConfirm bool
	finalPrompt := &survey.Confirm{
		Message: "Proceed with deletion?",
		Default: false,
	}
	err = survey.AskOne(finalPrompt, &finalConfirm)
	if err != nil || !finalConfirm {
		fmt.Println("Aborted.")
		return
	}

	removeNodeModules(selectedPaths)
}

// removeNodeModules deletes the specified node_modules folders
func removeNodeModules(paths []string) {
	var freedSpace int64
	for _, path := range paths {
		size := dirSize(path)
		fmt.Printf("Removing %s... ", path)
		err := os.RemoveAll(path)
		if err != nil {
			fmt.Printf("ERROR: %v\n", err)
		} else {
			fmt.Println("OK")
			freedSpace += size
		}
	}
	fmt.Printf("\nDone! Freed %s of disk space.\n", formatSize(freedSpace))
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
