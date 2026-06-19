package generator

import (
	"fmt"
	"os"
	"path/filepath"
)

type Registry struct {
	TemplateDirs []string
}

type Template struct {
	Definition
	Dir string
}

func (r *Registry) Scan() ([]Template, error) {
	var templates []Template

	for _, dir := range r.TemplateDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("scan %s: %w", dir, err)
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			tplDir := filepath.Join(dir, entry.Name())
			defPath := filepath.Join(tplDir, "template.yml")

			def, err := Parse(defPath)
			if err != nil {
				continue
			}

			templates = append(templates, Template{
				Definition: *def,
				Dir:        tplDir,
			})
		}
	}

	return templates, nil
}
