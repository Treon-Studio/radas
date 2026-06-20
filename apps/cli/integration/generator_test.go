package integration

import (
	"os"
	"path/filepath"
	"testing"
	"text/template"

	"github.com/raizora/radas/v4/internal/generator"
)

func title(s string) string {
	if len(s) == 0 {
		return s
	}
	return string(s[0]-32) + s[1:]
}

func TestGeneratorIntegration_FullPipeline(t *testing.T) {
	dir := t.TempDir()

	tplDir := filepath.Join(dir, "templates", "api-handler")
	if err := os.MkdirAll(tplDir, 0755); err != nil {
		t.Fatal(err)
	}

	ymlContent := `name: api-handler
description: Generate an API handler
version: 1
variables:
  - name: handler_name
    prompt: Handler name
    default: users
    validate: "^[a-z]+$"
  - name: package_name
    prompt: Package name
    default: handlers
outputs:
  - template: handler.go.gotpl
    target: "{{.handler_name}}.go"
  - template: handler_test.go.gotpl
    target: "{{.handler_name}}_test.go"
`
	if err := os.WriteFile(filepath.Join(tplDir, "template.yml"), []byte(ymlContent), 0644); err != nil {
		t.Fatal(err)
	}

	mainTpl := `package {{.package_name}}

type {{.handler_name | title}}Handler struct {
	// TODO: implement
}
`
	if err := os.WriteFile(filepath.Join(tplDir, "handler.go.gotpl"), []byte(mainTpl), 0644); err != nil {
		t.Fatal(err)
	}

	testTpl := `package {{.package_name}}

import "testing"

func Test{{.handler_name | title}}Handler(t *testing.T) {
	// TODO: write tests
}
`
	if err := os.WriteFile(filepath.Join(tplDir, "handler_test.go.gotpl"), []byte(testTpl), 0644); err != nil {
		t.Fatal(err)
	}

	reg := &generator.Registry{
		TemplateDirs: []string{filepath.Join(dir, "templates")},
	}

	templates, err := reg.Scan()
	if err != nil {
		t.Fatal(err)
	}

	if len(templates) != 1 {
		t.Fatalf("expected 1 template, got %d", len(templates))
	}

	if templates[0].Name != "api-handler" {
		t.Errorf("template name = %q, want %q", templates[0].Name, "api-handler")
	}

	vars, err := generator.ResolveVariables(&templates[0].Definition, nil, true)
	if err != nil {
		t.Fatal(err)
	}

	if vars["handler_name"] != "users" {
		t.Errorf("handler_name = %q, want %q", vars["handler_name"], "users")
	}
	if vars["package_name"] != "handlers" {
		t.Errorf("package_name = %q, want %q", vars["package_name"], "handlers")
	}

	outDir := filepath.Join(dir, "output")

	eng := &generator.Engine{
		TemplateDir: templates[0].Dir,
		Funcs: template.FuncMap{
			"title": title,
		},
	}

	if err := eng.Generate(&templates[0].Definition, outDir, vars); err != nil {
		t.Fatal(err)
	}

	expectedFiles := []string{
		filepath.Join(outDir, "users.go"),
		filepath.Join(outDir, "users_test.go"),
	}

	for _, f := range expectedFiles {
		if _, err := os.Stat(f); os.IsNotExist(err) {
			t.Errorf("expected file %s to exist", f)
		}
	}

	mainContent, err := os.ReadFile(expectedFiles[0])
	if err != nil {
		t.Fatal(err)
	}

	if string(mainContent) != `package handlers

type UsersHandler struct {
	// TODO: implement
}
` {
		t.Errorf("unexpected main file content:\n%s", string(mainContent))
	}

	if err := eng.Generate(&templates[0].Definition, outDir, vars); err != nil {
		t.Fatal(err)
	}

	vars2, _ := generator.ResolveVariables(&templates[0].Definition, map[string]string{"handler_name": "posts"}, true)
	outDir2 := filepath.Join(dir, "output2")

	eng2 := &generator.Engine{
		TemplateDir: templates[0].Dir,
		Force:       true,
		Funcs: template.FuncMap{
			"title": title,
		},
	}

	if err := eng2.Generate(&templates[0].Definition, outDir2, vars2); err != nil {
		t.Fatal(err)
	}

	postFile := filepath.Join(outDir2, "posts.go")
	if _, err := os.Stat(postFile); os.IsNotExist(err) {
		t.Errorf("expected overridden file %s to exist", postFile)
	}

	_, err = generator.ResolveVariables(&templates[0].Definition, map[string]string{"handler_name": "InvalidName"}, true)
	if err == nil {
		t.Error("expected error for invalid handler name (uppercase)")
	}
}

func TestGeneratorIntegration_GenerateTemplateAPI(t *testing.T) {
	dir := t.TempDir()

	tplDir := filepath.Join(dir, "templates", "simple")
	if err := os.MkdirAll(tplDir, 0755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tplDir, "template.yml"), []byte(`name: simple
version: 1
variables:
  - name: msg
    default: hello
outputs:
  - template: out.gotpl
    target: "result.txt"
`), 0644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(tplDir, "out.gotpl"), []byte("{{.msg}}"), 0644); err != nil {
		t.Fatal(err)
	}

	outDir := filepath.Join(dir, "out")
	err := generator.GenerateTemplateWith(generator.GenerateSettings{
		TemplateName:   "simple",
		OutDir:         outDir,
		Force:          true,
		NonInteractive: true,
		TemplateDirs:   []string{filepath.Join(dir, "templates")},
	})
	if err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(filepath.Join(outDir, "result.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello" {
		t.Errorf("content = %q, want %q", string(data), "hello")
	}

	outDir2 := filepath.Join(dir, "out2")
	err = generator.GenerateTemplateWith(generator.GenerateSettings{
		TemplateName:   "simple",
		Overrides:      map[string]string{"msg": "custom"},
		OutDir:         outDir2,
		Force:          true,
		NonInteractive: true,
		TemplateDirs:   []string{filepath.Join(dir, "templates")},
	})
	if err != nil {
		t.Fatal(err)
	}

	data2, err := os.ReadFile(filepath.Join(outDir2, "result.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data2) != "custom" {
		t.Errorf("content = %q, want %q", string(data2), "custom")
	}
}
