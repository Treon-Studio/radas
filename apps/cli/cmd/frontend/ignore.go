package frontend

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/raizora/radas/v4/internal/ignore"
)

var FeIgnoreCmd = &cobra.Command{
	Use:   "ignore [--stack=nextjs|vite|remix] [--force]",
	Short: "Generate or merge ignore files (.gitignore, .biomeignore, .prettierignore) for a frontend project",
	Long: `Fetches the FE ignore-file templates from the radas templates
repo and writes them to the current directory. If a file already
exists, existing patterns are preserved and template patterns are
appended (deduplicated). Pass --force to overwrite without merging.`,
	Run: runFeIgnore,
}

var (
	feIgnoreStack string
	feIgnoreForce bool
)

func init() {
	FeIgnoreCmd.Flags().StringVar(&feIgnoreStack, "stack", "nextjs", "stack variant (nextjs, vite, remix)")
	FeIgnoreCmd.Flags().BoolVar(&feIgnoreForce, "force", false, "overwrite existing files without merging")
}

func runFeIgnore(cmd *cobra.Command, args []string) {
	dest, err := os.MkdirTemp("", "radas-ignore-")
	if err != nil {
		feFatal("create temp dir: %v", err)
	}
	defer os.RemoveAll(dest)

	files, err := ignore.Fetch("fe", feIgnoreStack, dest)
	if err != nil {
		feFatal("%v", err)
	}

	for name, template := range files {
		if err := feWriteOrMerge(name, template, feIgnoreForce); err != nil {
			feFatal("%v", err)
		}
	}
	fmt.Printf("✓ Generated ignore files for fe (stack=%s)\n", feIgnoreStack)
}

func feWriteOrMerge(name, template string, force bool) error {
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
	if err := os.WriteFile(name, []byte(merged), 0644); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	return nil
}

func feFatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "fe ignore: "+format+"\n", args...)
	os.Exit(1)
}
