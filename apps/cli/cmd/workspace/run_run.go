package workspace

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/cache"
	"github.com/raizora/radas/v4/internal/graph"
	"github.com/raizora/radas/v4/internal/project"
	"github.com/raizora/radas/v4/internal/runner"
)

func runRun(cmd *cobra.Command, args []string) error {
	cfg, err := requireWorkspaceMode()
	if err != nil {
		return err
	}
	root, err := findWorkspaceRoot()
	if err != nil {
		return err
	}
	projects, _, _, err := loadProjects()
	if err != nil {
		return err
	}
	if len(projects) == 0 {
		return fmt.Errorf("no projects found in workspace")
	}

	taskName := args[0]
	projectName, _ := cmd.Flags().GetString("project")
	all, _ := cmd.Flags().GetBool("all")
	affected, _ := cmd.Flags().GetBool("affected")
	noCache, _ := cmd.Flags().GetBool("no-cache")
	maxParallel, _ := cmd.Flags().GetInt("max-parallel")
	baseRef, _ := cmd.Flags().GetString("base")

	var targetProjects []string
	switch {
	case projectName != "":
		targetProjects = []string{projectName}
	case affected:
		g, err := graph.Build(projects)
		if err != nil {
			return err
		}
		aff, err := g.Affected(root, baseRef, "HEAD")
		if err != nil {
			return err
		}
		targetProjects = aff
		fmt.Fprintf(cmd.OutOrStdout(), "Affected projects: %v\n", targetProjects)
	case all:
		for _, p := range projects {
			targetProjects = append(targetProjects, p.Name)
		}
	default:
		return fmt.Errorf("must specify --project, --all, or --affected")
	}

	taskDef, ok := cfg.Workspace.Tasks[taskName]
	if !ok {
		return fmt.Errorf("task %q not defined in radas.yml workspace.tasks", taskName)
	}

	var allNodes []runner.TaskNode
	for _, pn := range targetProjects {
		var fullProj project.Project
		found := false
		for _, p := range projects {
			if p.Name == pn {
				fullProj = p
				found = true
				break
			}
		}
		if !found {
			fmt.Fprintf(cmd.ErrOrStderr(), "warning: project %q not found in workspace, skipping\n", pn)
			continue
		}
		command, err := runner.Dispatch(runner.TaskNode{
			Project: fullProj,
			Task:    taskName,
		}, cfg.Workspace, "be", taskName)
		if err != nil {
			return err
		}
		if taskDef.Command != "" {
			command, _ = runner.DispatchCustom(runner.TaskNode{Project: fullProj, Task: taskName}, taskDef.Command)
		}
		allNodes = append(allNodes, runner.TaskNode{
			Project: fullProj,
			Task:    taskName,
			Command: command,
		})
	}

	if len(allNodes) == 0 {
		return fmt.Errorf("no projects to run")
	}

	batches, err := runner.Schedule(allNodes)
	if err != nil {
		return err
	}

	cacheDir := filepath.Join(os.Getenv("HOME"), ".radas", "cache")
	c := cache.NewLocalCache(cacheDir)
	opts := runner.ExecOptions{
		MaxParallel:  maxParallel,
		ForceNoCache: noCache,
	}

	var allResults []runner.TaskResult
	for batchIdx, batch := range batches {
		fmt.Fprintf(cmd.OutOrStdout(), "\n--- Batch %d ---\n", batchIdx+1)
		results := runner.RunBatch(batch, c, opts, cmd.OutOrStdout())
		allResults = append(allResults, results...)
		for _, r := range results {
			if r.Error != nil || r.ExitCode != 0 {
				fmt.Fprintf(cmd.ErrOrStderr(), "task %s/%s failed (exit %d)\n", r.Node.Project.Name, r.Node.Task, r.ExitCode)
				fmt.Fprintln(cmd.OutOrStdout(), "\nSummary:")
				runner.PrintSummary(allResults, cmd.OutOrStdout())
				return fmt.Errorf("task failed: %s/%s", r.Node.Project.Name, r.Node.Task)
			}
		}
	}
	fmt.Fprintln(cmd.OutOrStdout(), "\nSummary:")
	runner.PrintSummary(allResults, cmd.OutOrStdout())
	return nil
}
