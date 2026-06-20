// Package generator provides template-based code generation.
// It reads YAML definitions, renders .gotpl templates with text/template,
// and writes output files with skip-on-existing and force-overwrite semantics.
package generator

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"text/template"
)

type Engine struct {
	TemplateDir string
	Funcs       template.FuncMap
	Force       bool
}

func (e *Engine) Render(tplPath string, vars map[string]string) (string, error) {
	data, err := os.ReadFile(tplPath)
	if err != nil {
		return "", fmt.Errorf("read template: %w", err)
	}

	tplName := filepath.Base(tplPath)
	tpl, err := template.New(tplName).
		Option("missingkey=error").
		Funcs(e.Funcs).
		Parse(string(data))
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := tpl.Execute(&buf, vars); err != nil {
		return "", fmt.Errorf("render template: %w", err)
	}
	return buf.String(), nil
}

func (e *Engine) Generate(def *Definition, outDir string, vars map[string]string) error {
	for _, out := range def.Outputs {
		var targetBuf bytes.Buffer
		targetTpl, err := template.New("").
			Option("missingkey=error").
			Funcs(e.Funcs).
			Parse(out.Target)
		if err != nil {
			return fmt.Errorf("parse target %q: %w", out.Target, err)
		}
		if err := targetTpl.Execute(&targetBuf, vars); err != nil {
			return fmt.Errorf("evaluate target %q: %w", out.Target, err)
		}

		targetPath := filepath.Join(outDir, targetBuf.String())

		if _, err := os.Stat(targetPath); err == nil && !e.Force {
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return fmt.Errorf("mkdir target: %w", err)
		}

		tplFilePath := filepath.Join(e.TemplateDir, out.Template)
		content, err := e.Render(tplFilePath, vars)
		if err != nil {
			return fmt.Errorf("render template %q: %w", out.Template, err)
		}

		if err := os.WriteFile(targetPath, []byte(content), 0644); err != nil {
			return fmt.Errorf("write %s: %w", targetPath, err)
		}
	}
	return nil
}
