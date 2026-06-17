package infra

import (
	"fmt"
	"os"

	"github.com/raizora/radas/v4/internal/ignore"
	"github.com/spf13/cobra"
)

var InfraIgnoreCmd = &cobra.Command{
	Use:   "ignore [--stack=docker|terraform|k8s] [--force]",
	Short: "Generate or merge .gitignore and .dockerignore for an infra project",
	Run:   runInfraIgnore,
}

var (
	infraIgnoreStack string
	infraIgnoreForce bool
)

func init() {
	InfraIgnoreCmd.Flags().StringVar(&infraIgnoreStack, "stack", "docker", "stack variant (docker, terraform, k8s)")
	InfraIgnoreCmd.Flags().BoolVar(&infraIgnoreForce, "force", false, "overwrite existing files without merging")
}

func runInfraIgnore(cmd *cobra.Command, args []string) {
	dest, err := os.MkdirTemp("", "radas-ignore-")
	if err != nil {
		infraFatal("create temp dir: %v", err)
	}
	defer os.RemoveAll(dest)

	files, err := ignore.Fetch("infra", infraIgnoreStack, dest)
	if err != nil {
		infraFatal("%v", err)
	}

	for name, template := range files {
		if err := infraWriteOrMerge(name, template, infraIgnoreForce); err != nil {
			infraFatal("%v", err)
		}
	}
	fmt.Printf("✓ Generated ignore files for infra (stack=%s)\n", infraIgnoreStack)
}

func infraWriteOrMerge(name, template string, force bool) error {
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

func infraFatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "infra ignore: "+format+"\n", args...)
	os.Exit(1)
}
