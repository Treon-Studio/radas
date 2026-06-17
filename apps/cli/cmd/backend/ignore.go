package backend

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/ignore"
)

var BeIgnoreCmd = &cobra.Command{
	Use:   "ignore [--force]",
	Short: "Generate or merge .gitignore for a backend (Go) project",
	Run:   runBeIgnore,
}

var beIgnoreForce bool

func init() {
	BeIgnoreCmd.Flags().BoolVar(&beIgnoreForce, "force", false, "overwrite existing .gitignore without merging")
}

func runBeIgnore(cmd *cobra.Command, args []string) {
	dest, err := os.MkdirTemp("", "radas-ignore-")
	if err != nil {
		beFatal("create temp dir: %v", err)
	}
	defer os.RemoveAll(dest)

	files, err := ignore.Fetch("be", "default", dest)
	if err != nil {
		beFatal("%v", err)
	}

	for name, template := range files {
		if err := beWriteOrMerge(name, template, beIgnoreForce); err != nil {
			beFatal("%v", err)
		}
	}
	fmt.Println("✓ Generated .gitignore for be")
}

func beWriteOrMerge(name, template string, force bool) error {
	existing := ""
	if data, err := os.ReadFile(name); err == nil {
		binary, _ := ignore.IsBinary(name)
		if binary {
			return fmt.Errorf("%s is binary; refusing to merge (use --force to overwrite)", name)
		}
		existing = string(data)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read %s: %w", name, err)
	}
	merged, err := ignore.MergePatterns(existing, template, force)
	if err != nil {
		return fmt.Errorf("merge %s: %w", name, err)
	}
	return os.WriteFile(name, []byte(merged), 0644)
}

func beFatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "be ignore: "+format+"\n", args...)
	os.Exit(1)
}
