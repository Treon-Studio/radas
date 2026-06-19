package generator

import (
	"os"
	"path/filepath"
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
