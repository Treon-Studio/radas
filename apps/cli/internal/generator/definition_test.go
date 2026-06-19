package generator

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseValid(t *testing.T) {
	dir := t.TempDir()
	yml := `name: react-component
description: Generate a React component
version: 1
variables:
  - name: component_name
    description: Component name
    prompt: What is the component name?
    default: MyComponent
    validate: "^[A-Z][a-zA-Z0-9]+$"
  - name: use_client
    type: confirm
    default: true
    prompt: Add use client?
outputs:
  - template: Component.tsx.gotpl
    target: "{{.component_name}}/index.tsx"
`
	os.WriteFile(filepath.Join(dir, "template.yml"), []byte(yml), 0644)
	def, err := Parse(filepath.Join(dir, "template.yml"))
	if err != nil {
		t.Fatal(err)
	}
	if def.Name != "react-component" {
		t.Errorf("Name=%q", def.Name)
	}
	if len(def.Variables) != 2 {
		t.Errorf("got %d vars, want 2", len(def.Variables))
	}
	if def.Variables[1].Type != "confirm" {
		t.Errorf("second var type=%q", def.Variables[1].Type)
	}
	if len(def.Outputs) != 1 {
		t.Errorf("got %d outputs, want 1", len(def.Outputs))
	}
}

func TestParseMissingFile(t *testing.T) {
	_, err := Parse("/nonexistent/path.yml")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

func TestParseInvalidYAML(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "template.yml"), []byte("not: yaml: [broken"), 0644)
	_, err := Parse(filepath.Join(dir, "template.yml"))
	if err == nil {
		t.Error("expected error for invalid yaml")
	}
}
