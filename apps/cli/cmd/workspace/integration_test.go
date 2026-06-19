package workspace

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEndToEndWorkspace(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "radas.yml"),
		[]byte("name: e2e\nworkspace:\n  projects: [apps/*, libs/*]\n"), 0644)
	for _, p := range []struct {
		path, name, typ, dep string
	}{
		{"apps/api", "api", "backend-api", "[shared]"},
		{"apps/web", "web", "frontend-web", "[shared]"},
		{"libs/shared", "shared", "lib", ""},
	} {
		d := filepath.Join(root, p.path)
		os.MkdirAll(d, 0755)
		yml := "name: " + p.name + "\ntype: " + p.typ + "\n"
		if p.dep != "" {
			yml += "workspace:\n  depends_on: " + p.dep + "\n"
		}
		os.WriteFile(filepath.Join(d, "radas.yml"), []byte(yml), 0644)
	}
	oldDir, _ := os.Getwd()
	os.Chdir(root)
	defer os.Chdir(oldDir)

	// 1. list shows all 3 projects
	var buf bytes.Buffer
	listCmd.SetOut(&buf)
	if err := runList(listCmd); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"api", "web", "shared"} {
		if !strings.Contains(buf.String(), n) {
			t.Errorf("list missing %q: %s", n, buf.String())
		}
	}

	// 2. show displays project details
	buf.Reset()
	showCmd.SetOut(&buf)
	if err := runShow(showCmd, []string{"api"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), "Dependencies") {
		t.Errorf("show missing Dependencies: %s", buf.String())
	}

	// 3. graph --ascii produces output
	buf.Reset()
	graphCmd.SetOut(&buf)
	graphCmd.SetArgs([]string{"--ascii"})
	if err := runGraph(graphCmd); err != nil {
		t.Fatal(err)
	}
	if buf.Len() == 0 {
		t.Error("graph produced empty output")
	}

	// 4. validate reports OK
	buf.Reset()
	validateCmd.SetOut(&buf)
	if err := runValidate(validateCmd); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), "OK") {
		t.Errorf("validate: %s", buf.String())
	}
}
