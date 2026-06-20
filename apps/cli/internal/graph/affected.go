package graph

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/raizora/radas/v4/internal/project"
)

// mapFilesToProjects maps changed files to the projects that contain them.
// A file belongs to a project if its path is under the project's Path.
func mapFilesToProjects(files []string, projects []project.Project) []string {
	seen := map[string]bool{}
	var affected []string
	for _, f := range files {
		f = strings.TrimPrefix(f, "./")
		for _, p := range projects {
			if p.Path == "" {
				continue
			}
			prefix := p.Path
			if !strings.HasSuffix(prefix, "/") {
				prefix += "/"
			}
			if strings.HasPrefix(f, prefix) || f == p.Path {
				if !seen[p.Name] {
					seen[p.Name] = true
					affected = append(affected, p.Name)
				}
			}
		}
	}
	return affected
}

// gitDiffFiles returns files changed between baseRef and headRef.
func gitDiffFiles(repoDir, baseRef, headRef string) ([]string, error) {
	cmd := exec.Command("git", "diff", "--name-only", baseRef+"..."+headRef)
	cmd.Dir = repoDir
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff %s...%s: %w", baseRef, headRef, err)
	}
	var files []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" {
			files = append(files, line)
		}
	}
	return files, nil
}

// Descendants returns all projects that transitively depend on name
// (i.e., things that would be affected if name changed).
func (g *Graph) Descendants(name string) ([]string, error) {
	visited := map[string]bool{}
	var result []string
	var walk func(string) error
	walk = func(n string) error {
		deps, _ := g.Dependents(n)
		for _, d := range deps {
			if visited[d] {
				continue
			}
			visited[d] = true
			result = append(result, d)
			if err := walk(d); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(name); err != nil {
		return nil, err
	}
	return result, nil
}

// Affected returns project names affected by changes between baseRef and
// headRef. "Affected" means: the project contains a changed file, OR
// transitively depends on a project that does.
func (g *Graph) Affected(repoDir, baseRef, headRef string) ([]string, error) {
	files, err := gitDiffFiles(repoDir, baseRef, headRef)
	if err != nil {
		return nil, err
	}

	all := g.AllNames()
	projects := []project.Project{}
	for _, name := range all {
		p, _ := g.Vertex(name)
		projects = append(projects, p)
	}

	directlyChanged := mapFilesToProjects(files, projects)
	if len(directlyChanged) == 0 {
		return nil, nil
	}

	seen := map[string]bool{}
	for _, n := range directlyChanged {
		seen[n] = true
	}
	for _, n := range directlyChanged {
		descendants, _ := g.Descendants(n)
		for _, d := range descendants {
			seen[d] = true
		}
	}
	var result []string
	for n := range seen {
		result = append(result, n)
	}
	return result, nil
}
