package generator

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateTemplate(t *testing.T) {
	dir := t.TempDir()

	tplDir := filepath.Join(dir, "templates", "my-template")
	if err := os.MkdirAll(tplDir, 0755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tplDir, "template.yml"), []byte(`name: my-template
version: 1
variables:
  - name: name
    default: world
outputs:
  - template: hello.gotpl
    target: "{{.name}}.txt"
`), 0644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tplDir, "hello.gotpl"), []byte("hello {{.name}}"), 0644); err != nil {
		t.Fatal(err)
	}

	outDir := filepath.Join(dir, "output")
	err := GenerateTemplateWith(GenerateSettings{
		TemplateName:   "my-template",
		OutDir:         outDir,
		Force:          true,
		NonInteractive: true,
		TemplateDirs:   []string{filepath.Join(dir, "templates")},
	})
	if err != nil {
		t.Fatal(err)
	}

	outPath := filepath.Join(outDir, "world.txt")
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatal("expected output file:", err)
	}
	if string(data) != "hello world" {
		t.Errorf("content = %q, want %q", string(data), "hello world")
	}
}

func TestGenerateTemplate_Overrides(t *testing.T) {
	dir := t.TempDir()

	tplDir := filepath.Join(dir, "templates", "greet")
	if err := os.MkdirAll(tplDir, 0755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tplDir, "template.yml"), []byte(`name: greet
version: 1
variables:
  - name: name
    default: world
outputs:
  - template: greet.gotpl
    target: "{{.name}}.txt"
`), 0644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tplDir, "greet.gotpl"), []byte("hi {{.name}}"), 0644); err != nil {
		t.Fatal(err)
	}

	outDir := filepath.Join(dir, "out")
	err := GenerateTemplateWith(GenerateSettings{
		TemplateName:   "greet",
		Overrides:      map[string]string{"name": "you"},
		OutDir:         outDir,
		Force:          true,
		NonInteractive: true,
		TemplateDirs:   []string{filepath.Join(dir, "templates")},
	})
	if err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(outDir, "you.txt"))
	if err != nil {
		t.Fatal("expected output file:", err)
	}
	if string(data) != "hi you" {
		t.Errorf("content = %q, want %q", string(data), "hi you")
	}
}

func TestGenerateTemplate_NotFound(t *testing.T) {
	dir := t.TempDir()
	err := GenerateTemplateWith(GenerateSettings{
		TemplateName:   "nonexistent",
		OutDir:         "/tmp",
		NonInteractive: true,
		TemplateDirs:   []string{filepath.Join(dir, "templates")},
	})
	if err == nil {
		t.Fatal("expected error for nonexistent template")
	}
}
