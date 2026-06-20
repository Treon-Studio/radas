package workspace

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/raizora/radas/v4/internal/project"
)

func TestParseDepsFromRadasYML(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "apps", "api")
	os.MkdirAll(proj, 0755)
	os.WriteFile(filepath.Join(proj, "radas.yml"),
		[]byte("name: api\nworkspace:\n  depends_on: [shared, auth]\n"), 0644)
	p := &project.Project{Name: "api", Path: "apps/api"}
	all := []project.Project{*p, {Name: "shared"}, {Name: "auth"}}
	deps, err := ParseDeps(p, all, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(deps) != 2 {
		t.Errorf("got %v", deps)
	}
}

func TestParseDepsFiltersUnknown(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "apps", "api")
	os.MkdirAll(proj, 0755)
	os.WriteFile(filepath.Join(proj, "radas.yml"),
		[]byte("name: api\nworkspace:\n  depends_on: [shared, ghost]\n"), 0644)
	p := &project.Project{Name: "api", Path: "apps/api"}
	all := []project.Project{*p, {Name: "shared"}}
	deps, err := ParseDeps(p, all, root)
	if err != nil {
		t.Fatal(err)
	}
	if len(deps) != 1 || deps[0] != "shared" {
		t.Errorf("got %v", deps)
	}
}
