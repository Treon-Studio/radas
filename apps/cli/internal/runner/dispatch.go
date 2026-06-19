package runner

import (
	"fmt"
	"strings"

	"github.com/raizora/radas/v4/internal/config"
)

// Dispatch resolves a (project, task) to a radas command string. The
// command group comes from cfg.TaskTypes[project.Type].
func Dispatch(node TaskNode, cfg *config.WorkspaceConfig, defaultGroup, defaultTask string) (string, error) {
	group := defaultGroup
	if cfg != nil && cfg.TaskTypes != nil {
		if g, ok := cfg.TaskTypes[node.Project.Type]; ok && g != "" {
			group = g
		}
	}
	return fmt.Sprintf("%s %s --project=%s", group, node.Task, node.Project.Name), nil
}

// DispatchCustom uses a custom command string from radas.yml task definition.
func DispatchCustom(node TaskNode, cmdTemplate string) (string, error) {
	if !strings.Contains(cmdTemplate, "%s") {
		return fmt.Sprintf("%s --project=%s", cmdTemplate, node.Project.Name), nil
	}
	return fmt.Sprintf(cmdTemplate, node.Project.Name), nil
}
