package generator

import (
	"os"
	"path/filepath"
	"strings"
	"text/template"
	"testing"
)

func TestEngine_Render_Basic(t *testing.T) {
	dir := t.TempDir()
	tpl := `package {{.name}}

type {{.type}} struct {
	ID string
}
`
	tplPath := filepath.Join(dir, "model.go.gotpl")
	if err := os.WriteFile(tplPath, []byte(tpl), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	eng := &Engine{
		Funcs: nil,
	}
	vars := map[string]string{
		"name": "user",
		"type": "User",
	}
	result, err := eng.Render(tplPath, vars)
	if err != nil {
		t.Fatal(err)
	}
	want := `package user

type User struct {
	ID string
}
`
	if result != want {
		t.Errorf("Render()\ngot:\n%s\nwant:\n%s", result, want)
	}
}

func TestEngine_Render_MissingKey(t *testing.T) {
	dir := t.TempDir()
	tpl := `hello {{.name}}`
	tplPath := filepath.Join(dir, "hello.gotpl")
	if err := os.WriteFile(tplPath, []byte(tpl), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	eng := &Engine{}
	_, err := eng.Render(tplPath, map[string]string{})
	if err == nil {
		t.Error("expected error for missing key")
	}
}

func TestEngine_Render_NestedPath(t *testing.T) {
	dir := t.TempDir()
	tpl := `{{.message}}`
	tplPath := filepath.Join(dir, "templates", "greeting.gotpl")
	if err := os.MkdirAll(filepath.Join(dir, "templates"), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(tplPath, []byte(tpl), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	eng := &Engine{
		Funcs: nil,
	}
	vars := map[string]string{"message": "hi"}
	result, err := eng.Render(tplPath, vars)
	if err != nil {
		t.Fatal(err)
	}
	if result != "hi" {
		t.Errorf("got %q, want %q", result, "hi")
	}
}

func TestEngine_Generate_Basic(t *testing.T) {
	dir := t.TempDir()

	tplContent := `package {{.name}}

type {{.type}} struct {
	ID string
}
`
	tplDir := filepath.Join(dir, "templates")
	if err := os.MkdirAll(tplDir, 0755); err != nil {
		t.Fatalf("mkdir templates: %v", err)
	}
	tplPath := filepath.Join(tplDir, "model.go.gotpl")
	if err := os.WriteFile(tplPath, []byte(tplContent), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	def := &Definition{
		Name: "model",
		Variables: []Variable{
			{Name: "name", Type: "string"},
			{Name: "type", Type: "string"},
		},
		Outputs: []Output{
			{
				Template: "model.go.gotpl",
				Target:   "{{.name}}/{{.type | lower}}.go",
			},
		},
	}

	eng := &Engine{
		TemplateDir: tplDir,
		Funcs: template.FuncMap{
			"lower": strings.ToLower,
		},
	}

	vars := map[string]string{
		"name": "user",
		"type": "User",
	}

	outDir := filepath.Join(dir, "output")
	err := eng.Generate(def, outDir, vars)
	if err != nil {
		t.Fatal(err)
	}

	expectedPath := filepath.Join(outDir, "user", "user.go")
	data, err := os.ReadFile(expectedPath)
	if err != nil {
		t.Fatal("expected file at", expectedPath, err)
	}

	want := `package user

type User struct {
	ID string
}
`
	if string(data) != want {
		t.Errorf("generated content:\n%s\nwant:\n%s", string(data), want)
	}
}

func TestEngine_Generate_SkipExisting(t *testing.T) {
	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "t.gotpl"), []byte("content"), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	def := &Definition{
		Name: "test",
		Outputs: []Output{
			{
				Template: "t.gotpl",
				Target:   "out.txt",
			},
		},
	}

	outDir := filepath.Join(dir, "output")
	outPath := filepath.Join(outDir, "out.txt")
	if err := os.MkdirAll(outDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(outPath, []byte("existing"), 0644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}

	eng := &Engine{TemplateDir: dir}
	err := eng.Generate(def, outDir, map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	data, _ := os.ReadFile(outPath)
	if string(data) != "existing" {
		t.Errorf("file was overwritten: got %q, want %q", string(data), "existing")
	}
}

func TestEngine_Generate_ForceOverwrite(t *testing.T) {
	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "t.gotpl"), []byte("new-content"), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	def := &Definition{
		Name: "test",
		Outputs: []Output{
			{Template: "t.gotpl", Target: "out.txt"},
		},
	}

	outDir := filepath.Join(dir, "output")
	outPath := filepath.Join(outDir, "out.txt")
	if err := os.MkdirAll(outDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(outPath, []byte("old"), 0644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}

	eng := &Engine{
		TemplateDir: dir,
		Force:       true,
	}
	err := eng.Generate(def, outDir, map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	data, _ := os.ReadFile(outPath)
	if string(data) != "new-content" {
		t.Errorf("file not overwritten: got %q, want %q", string(data), "new-content")
	}
}
