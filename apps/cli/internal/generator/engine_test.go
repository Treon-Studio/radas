package generator

import (
	"os"
	"path/filepath"
	"strings"
	"text/template"
	"testing"
)

func TestEngineRender(t *testing.T) {
	dir := t.TempDir()
	tpl := `package {{.name}}

type {{.type}} struct {
	ID string
}
`
	tplPath := filepath.Join(dir, "model.go.gotpl")
	os.WriteFile(tplPath, []byte(tpl), 0644)

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

func TestEngineRenderMissingKey(t *testing.T) {
	dir := t.TempDir()
	tpl := `hello {{.name}}`
	tplPath := filepath.Join(dir, "hello.gotpl")
	os.WriteFile(tplPath, []byte(tpl), 0644)

	eng := &Engine{}
	_, err := eng.Render(tplPath, map[string]string{})
	if err == nil {
		t.Error("expected error for missing key")
	}
}

func TestEngineRenderTemplateDir(t *testing.T) {
	dir := t.TempDir()
	tpl := `{{.message}}`
	tplPath := filepath.Join(dir, "templates", "greeting.gotpl")
	os.MkdirAll(filepath.Join(dir, "templates"), 0755)
	os.WriteFile(tplPath, []byte(tpl), 0644)

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

func TestGenerate(t *testing.T) {
	dir := t.TempDir()

	tplContent := `package {{.name}}

type {{.type}} struct {
	ID string
}
`
	tplDir := filepath.Join(dir, "templates")
	os.MkdirAll(tplDir, 0755)
	tplPath := filepath.Join(tplDir, "model.go.gotpl")
	os.WriteFile(tplPath, []byte(tplContent), 0644)

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

func TestGenerateExistingFile(t *testing.T) {
	dir := t.TempDir()

	os.WriteFile(filepath.Join(dir, "t.gotpl"), []byte("content"), 0644)

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
	os.MkdirAll(outDir, 0755)
	os.WriteFile(outPath, []byte("existing"), 0644)

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

func TestGenerateWithForce(t *testing.T) {
	dir := t.TempDir()

	os.WriteFile(filepath.Join(dir, "t.gotpl"), []byte("new-content"), 0644)

	def := &Definition{
		Name: "test",
		Outputs: []Output{
			{Template: "t.gotpl", Target: "out.txt"},
		},
	}

	outDir := filepath.Join(dir, "output")
	outPath := filepath.Join(outDir, "out.txt")
	os.MkdirAll(outDir, 0755)
	os.WriteFile(outPath, []byte("old"), 0644)

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
