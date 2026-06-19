// Package workspace implements the `radas workspace` command group.
package workspace

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/project"
	"github.com/raizora/radas/v4/internal/workspace"
)

// Cmd is the parent command for the workspace group.
var Cmd = &cobra.Command{
	Use:   "workspace",
	Short: "Manage and inspect a monorepo workspace",
	Long: `The workspace command group provides monorepo-level operations: project
discovery, dependency graph visualization, validation, and (in later phases) task
orchestration, code generation, and AI-assisted interaction.

Available only when the current directory (or a parent) has a radas.yml with a
'workspace:' section. Otherwise commands error with a hint to run
'radas workspace init' from a monorepo root.`,
}

func init() {
	Cmd.AddCommand(initCmd, listCmd, showCmd, graphCmd, validateCmd, runCmd, affectedCmd, cacheCmd, templateCmd)
}

func requireWorkspaceMode() (*config.RadasConfig, error) {
	cfgPath, err := config.FindConfig()
	if err != nil {
		return nil, fmt.Errorf("no radas.yml found: %w", err)
	}
	cfg, err := config.ParseConfig(cfgPath)
	if err != nil {
		return nil, err
	}
	if workspace.DetectMode(cfg) != workspace.ModeWorkspace {
		return nil, fmt.Errorf("not in workspace mode (radas.yml has no workspace: section)\n" +
			"Hint: run 'radas workspace init' from a monorepo root to enable workspace mode")
	}
	return cfg, nil
}

// findWorkspaceRoot returns the dir containing the radas.yml that
// requireWorkspaceMode loaded.
func findWorkspaceRoot() (string, error) {
	path, err := config.FindConfig()
	if err != nil {
		return "", err
	}
	return filepathDir(path), nil
}

// loadProjects scans the workspace and parses deps for each project.
func loadProjects() ([]project.Project, *config.RadasConfig, string, error) {
	cfg, err := requireWorkspaceMode()
	if err != nil {
		return nil, nil, "", err
	}
	root, err := findWorkspaceRoot()
	if err != nil {
		return nil, nil, "", err
	}
	projects, err := workspace.Scan(root, cfg.Workspace)
	if err != nil {
		return nil, nil, "", err
	}
	for i := range projects {
		deps, err := workspace.ParseDeps(&projects[i], projects, root)
		if err != nil {
			return nil, nil, "", err
		}
		projects[i].Dependencies = deps
	}
	return projects, cfg, root, nil
}
