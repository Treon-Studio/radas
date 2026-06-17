package ignore

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const templateRepo = "github.com/raizora/radas-templates/ignore"

var (
	teamFe = teamSpec{
		files: map[string][]string{
			".gitignore":      {"gitignore/<stack>.gitignore"},
			".biomeignore":    {"biomeignore/default.biomeignore"},
			".prettierignore": {"prettierignore/default.prettierignore"},
		},
		stacks:       []string{"nextjs", "vite", "remix"},
		defaultStack: "nextjs",
	}
	teamBe = teamSpec{
		files: map[string][]string{
			".gitignore": {"gitignore/default.gitignore"},
		},
		stacks:       []string{"default"},
		defaultStack: "default",
	}
	teamInfra = teamSpec{
		files: map[string][]string{
			".gitignore":    {"gitignore/<stack>.gitignore"},
			".dockerignore": {"dockerignore/default.dockerignore"},
		},
		stacks:       []string{"docker", "terraform", "k8s"},
		defaultStack: "docker",
	}

	teams = map[string]teamSpec{
		"fe":    teamFe,
		"be":    teamBe,
		"infra": teamInfra,
	}
)

type teamSpec struct {
	files        map[string][]string
	stacks       []string
	defaultStack string
}

func Fetch(team, stack, destDir string) (map[string]string, error) {
	spec, ok := teams[team]
	if !ok {
		return nil, fmt.Errorf("unknown team %q (valid: fe, be, infra)", team)
	}
	if stack == "" {
		stack = spec.defaultStack
	}
	if !containsString(spec.stacks, stack) {
		return nil, fmt.Errorf("unknown stack %q for team %q (valid: %s)",
			stack, team, strings.Join(spec.stacks, ", "))
	}

	if _, err := fetchViaDegit(templateRepo, destDir); err != nil {
		return nil, fmt.Errorf("fetch templates: %w", err)
	}

	results := map[string]string{}
	for outName, patterns := range spec.files {
		rel := patterns[0]
		rel = strings.ReplaceAll(rel, "<stack>", stack)
		src := filepath.Join(destDir, "ignore", team, rel)
		data, err := os.ReadFile(src)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", src, err)
		}
		results[outName] = string(data)
	}
	return results, nil
}

func containsString(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
