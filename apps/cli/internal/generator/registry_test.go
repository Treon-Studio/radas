package generator

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRegistry_Scan(t *testing.T) {
	dir := t.TempDir()

	// Create template 1
	t1Dir := filepath.Join(dir, "templates", "react-component")
	if err := os.MkdirAll(t1Dir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(t1Dir, "template.yml"), []byte(`name: react-component
description: Generate a React component
version: 1
variables:
  - name: component_name
    prompt: Component name
outputs:
  - template: Component.tsx.gotpl
    target: "{{.component_name}}/index.tsx"
`), 0644); err != nil {
		t.Fatalf("write template.yml: %v", err)
	}
	if err := os.WriteFile(filepath.Join(t1Dir, "Component.tsx.gotpl"), []byte("// {{.component_name}}"), 0644); err != nil {
		t.Fatalf("write Component.tsx.gotpl: %v", err)
	}

	// Create template 2
	t2Dir := filepath.Join(dir, "templates", "go-api")
	if err := os.MkdirAll(t2Dir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(t2Dir, "template.yml"), []byte(`name: go-api
description: Go API handler
version: 1
variables:
  - name: handler_name
outputs:
  - template: handler.go.gotpl
    target: "{{.handler_name}}.go"
`), 0644); err != nil {
		t.Fatalf("write template.yml: %v", err)
	}
	if err := os.WriteFile(filepath.Join(t2Dir, "handler.go.gotpl"), []byte("package {{.handler_name}}"), 0644); err != nil {
		t.Fatalf("write handler.go.gotpl: %v", err)
	}

	// Create non-template directory (no template.yml) — should be skipped
	if err := os.MkdirAll(filepath.Join(dir, "templates", "not-a-template"), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "templates", "not-a-template", "readme.md"), []byte("hi"), 0644); err != nil {
		t.Fatalf("write readme.md: %v", err)
	}

	reg := &Registry{TemplateDirs: []string{filepath.Join(dir, "templates")}}
	templates, err := reg.Scan()
	if err != nil {
		t.Fatal(err)
	}

	if len(templates) != 2 {
		t.Fatalf("got %d templates, want 2", len(templates))
	}

	// Verify template 1
	var found bool
	for _, tmpl := range templates {
		if tmpl.Name == "react-component" {
			found = true
			if tmpl.Description != "Generate a React component" {
				t.Errorf("Description = %q", tmpl.Description)
			}
			if len(tmpl.Outputs) != 1 {
				t.Errorf("Outputs = %d, want 1", len(tmpl.Outputs))
			}
			if tmpl.Dir != t1Dir {
				t.Errorf("Dir = %q, want %q", tmpl.Dir, t1Dir)
			}
		}
	}
	if !found {
		t.Error("react-component not found in scanned templates")
	}
}

func TestRegistry_Scan_MissingDir(t *testing.T) {
	dir := t.TempDir()
	reg := &Registry{TemplateDirs: []string{filepath.Join(dir, "nonexistent")}}
	templates, err := reg.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if len(templates) != 0 {
		t.Errorf("got %d templates, want 0", len(templates))
	}
}

func TestRegistry_ScanNoTemplateDirs(t *testing.T) {
	reg := &Registry{}
	templates, err := reg.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if len(templates) != 0 {
		t.Errorf("got %d templates, want 0", len(templates))
	}
}

func TestRegistry_Add_InvalidURL(t *testing.T) {
	reg := &Registry{}
	_, err := reg.Add("not-a-valid-url", t.TempDir())
	if err == nil {
		t.Error("expected error for invalid URL")
	}
}

func TestRegistry_Add_EmptyURL(t *testing.T) {
	reg := &Registry{}
	_, err := reg.Add("", t.TempDir())
	if err == nil {
		t.Error("expected error for empty URL")
	}
}
