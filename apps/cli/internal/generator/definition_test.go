package generator

import (
	"os"
	"path/filepath"
	"strings"
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
		t.Errorf("Name = %q, want %q", def.Name, "react-component")
	}
	if def.Description != "Generate a React component" {
		t.Errorf("Description = %q, want %q", def.Description, "Generate a React component")
	}
	if len(def.Variables) != 2 {
		t.Errorf("got %d vars, want 2", len(def.Variables))
	}
	if def.Variables[0].Name != "component_name" {
		t.Errorf("Variables[0].Name = %q, want %q", def.Variables[0].Name, "component_name")
	}
	if def.Variables[0].Validate != "^[A-Z][a-zA-Z0-9]+$" {
		t.Errorf("Variables[0].Validate = %q", def.Variables[0].Validate)
	}
	if def.Variables[1].Type != "confirm" {
		t.Errorf("second var type = %q, want %q", def.Variables[1].Type, "confirm")
	}
	if len(def.Outputs) != 1 {
		t.Errorf("got %d outputs, want 1", len(def.Outputs))
	}
	if def.Outputs[0].Target != "{{.component_name}}/index.tsx" {
		t.Errorf("Outputs[0].Target = %q, want %q", def.Outputs[0].Target, "{{.component_name}}/index.tsx")
	}
}

func TestParseMissingFile(t *testing.T) {
	_, err := Parse("/nonexistent/path.yml")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
	if !strings.Contains(err.Error(), "read") {
		t.Errorf("error = %q, want 'read' in message", err)
	}
}

func TestParseInvalidYAML(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "template.yml"), []byte("not: yaml: [broken"), 0644)
	_, err := Parse(filepath.Join(dir, "template.yml"))
	if err == nil {
		t.Fatal("expected error for invalid yaml")
	}
	if !strings.Contains(err.Error(), "parse") {
		t.Errorf("error = %q, want 'parse' in message", err)
	}
}

func TestParseDefaults(t *testing.T) {
	dir := t.TempDir()
	yml := `name: defaults-test
variables:
  - name: foo
`
	os.WriteFile(filepath.Join(dir, "t.yml"), []byte(yml), 0644)
	def, err := Parse(filepath.Join(dir, "t.yml"))
	if err != nil {
		t.Fatal(err)
	}
	if def.Version != 1 {
		t.Errorf("Version = %d, want 1", def.Version)
	}
	if def.Variables[0].Type != "string" {
		t.Errorf("Variables[0].Type = %q, want %q", def.Variables[0].Type, "string")
	}
}

func TestParseMissingName(t *testing.T) {
	dir := t.TempDir()
	yml := `variables:
  - name: foo
`
	os.WriteFile(filepath.Join(dir, "t.yml"), []byte(yml), 0644)
	_, err := Parse(filepath.Join(dir, "t.yml"))
	if err == nil {
		t.Fatal("expected error for missing name")
	}
	if !strings.Contains(err.Error(), "has no name") {
		t.Errorf("error = %q, want message containing 'has no name'", err)
	}
}
