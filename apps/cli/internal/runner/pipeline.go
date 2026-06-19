// Package runner orchestrates task execution with topological scheduling,
// parallel goroutine pool, and content-addressable caching.
package runner

import (
	"fmt"
	"strings"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/project"
)

// TaskNode is a single (project, task) pair to execute.
type TaskNode struct {
	Project project.Project
	Task    string
	Command string // the resolved command (after dispatch)
}

// ResolvePlan expands dependsOn for a target task into a flat list of
// TaskNodes. The `^` prefix means "same task in upstream projects".
// Plain names mean "same task in the same project".
func ResolvePlan(targetProject, targetTask string, def config.TaskDefinition, projects []project.Project) ([]TaskNode, error) {
	byName := map[string]project.Project{}
	for _, p := range projects {
		byName[p.Name] = p
	}

	type key struct{ proj, task string }
	seen := map[key]bool{}
	var order []TaskNode

	var add func(proj project.Project, task string) error
	add = func(proj project.Project, task string) error {
		k := key{proj.Name, task}
		if seen[k] {
			return nil
		}
		seen[k] = true
		order = append(order, TaskNode{Project: proj, Task: task})
		return nil
	}

	for _, dep := range def.DependsOn {
		if strings.HasPrefix(dep, "^") {
			upstreamTask := strings.TrimPrefix(dep, "^")
			target, ok := byName[targetProject]
			if !ok {
				return nil, fmt.Errorf("target project %q not found", targetProject)
			}
			walkUpstream(target, upstreamTask, byName, add)
		} else {
			proj, ok := byName[targetProject]
			if !ok {
				return nil, fmt.Errorf("project %q not found", targetProject)
			}
			if err := add(proj, dep); err != nil {
				return nil, err
			}
		}
	}
	target, ok := byName[targetProject]
	if !ok {
		return nil, fmt.Errorf("project %q not found", targetProject)
	}
	if err := add(target, targetTask); err != nil {
		return nil, err
	}
	return order, nil
}

func walkUpstream(target project.Project, task string, byName map[string]project.Project, add func(project.Project, string) error) {
	for _, depName := range target.Dependencies {
		dep, ok := byName[depName]
		if !ok {
			continue
		}
		_ = add(dep, task)
		walkUpstream(dep, task, byName, add)
	}
}
