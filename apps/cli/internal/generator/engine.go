package generator

import (
	"bytes"
	"fmt"
	"os"
	"text/template"
)

type Engine struct {
	Funcs template.FuncMap
}

func (e *Engine) Render(tplPath string, vars map[string]string) (string, error) {
	data, err := os.ReadFile(tplPath)
	if err != nil {
		return "", fmt.Errorf("read template: %w", err)
	}

	tpl, err := template.New("").
		Option("missingkey=error").
		Funcs(e.Funcs).
		Parse(string(data))
	if err != nil {
		return "", fmt.Errorf("parse gotpl: %w", err)
	}

	var buf bytes.Buffer
	if err := tpl.Execute(&buf, vars); err != nil {
		return "", fmt.Errorf("render gotpl: %w", err)
	}
	return buf.String(), nil
}
