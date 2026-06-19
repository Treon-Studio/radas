package workspace

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

const initTemplate = `name: %s
type: monorepo
stacks: []
workspace:
  projects:
    - apps/*
    - libs/*
  exclude:
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/bin/**"
  task_types: {}
  tasks:
    build:
      depends_on: ["^build"]
      cache: true
    test:
      depends_on: ["build"]
      cache: true
`

func runInit(cmd *cobra.Command) error {
	cwd, _ := os.Getwd()
	ymlPath := filepath.Join(cwd, "radas.yml")

	force, _ := cmd.Flags().GetBool("force")
	if _, err := os.Stat(ymlPath); err == nil && force == false {
		return fmt.Errorf("radas.yml already exists in %s (use --force to overwrite)", cwd)
	}
	name := filepath.Base(cwd)
	content := fmt.Sprintf(initTemplate, name)
	if err := os.WriteFile(ymlPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("write radas.yml: %w", err)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Created %s\n", ymlPath)
	fmt.Fprintln(cmd.OutOrStdout(),
		"Next: edit radas.yml to set projects, task_types, and tasks. Then run `radas workspace list`.")
	return nil
}

func init() {
	initCmd.Flags().Bool("force", false, "overwrite existing radas.yml")
}
