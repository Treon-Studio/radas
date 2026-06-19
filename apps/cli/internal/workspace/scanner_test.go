package workspace

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/raizora/radas/v4/internal/config"
)

func TestScanFindsProjects(t *testing.T) {
	root := t.TempDir()
	for _, p := range []struct{ path, name, typ string }{
		{"apps/api", "api", "backend-api"},
		{"libs/shared", "shared", "lib"},
		{"apps/web", "@org/web", "frontend-web"},
	} {
		dir := filepath.Join(root, p.path)
		os.MkdirAll(dir, 0755)
		if p.typ == "frontend-web" {
			os.WriteFile(filepath.Join(dir, "package.json"),
				[]byte(`{"name":"`+p.name+`"}`), 0644)
		} else {
			os.WriteFile(filepath.Join(dir, "radas.yml"),
				[]byte("name: "+p.name+"\ntype: "+p.typ+"\n"), 0644)
		}
	}
	cfg := &config.WorkspaceConfig{
		Projects: []string{"apps/*", "libs/*"},
		Exclude:  []string{"**/node_modules/**"},
	}
	projects, err := Scan(root, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 3 {
		t.Errorf("got %d want 3: %+v", len(projects), projects)
	}
}

func TestScanExcludesNodeModules(t *testing.T) {
	root := t.TempDir()
	nm := filepath.Join(root, "apps", "api", "node_modules", "foo")
	os.MkdirAll(nm, 0755)
	os.WriteFile(filepath.Join(nm, "package.json"), []byte(`{"name":"foo"}`), 0644)
	cfg := &config.WorkspaceConfig{
		Projects: []string{"apps/**"},
		Exclude:  []string{"**/node_modules/**"},
	}
	projects, err := Scan(root, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 0 {
		t.Errorf("got %d want 0 (excluded): %+v", len(projects), projects)
	}
}
