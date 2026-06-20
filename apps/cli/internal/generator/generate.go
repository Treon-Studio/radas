package generator

import (
	"fmt"
)

// GenerateSettings holds the options for template generation.
type GenerateSettings struct {
	TemplateName   string
	Overrides      map[string]string
	OutDir         string
	Force          bool
	NonInteractive bool
	TemplateDirs   []string
	TemplateDir    string // convenience: single directory (defaults to "./templates")
}

// GenerateTemplate generates files from a named template using the provided settings.
func GenerateTemplate(name string, overrides map[string]string, outDir string, force bool, nonInteractive bool) error {
	return GenerateTemplateWith(GenerateSettings{
		TemplateName:   name,
		Overrides:      overrides,
		OutDir:         outDir,
		Force:          force,
		NonInteractive: nonInteractive,
		TemplateDirs:   []string{"./templates"},
	})
}

// GenerateTemplateWith generates files from a template with full settings control.
func GenerateTemplateWith(settings GenerateSettings) error {
	if settings.TemplateDir != "" {
		settings.TemplateDirs = []string{settings.TemplateDir}
	}
	if len(settings.TemplateDirs) == 0 {
		settings.TemplateDirs = []string{"./templates"}
	}

	reg := &Registry{TemplateDirs: settings.TemplateDirs}
	templates, err := reg.Scan()
	if err != nil {
		return fmt.Errorf("scan templates: %w", err)
	}

	var tmpl *Template
	for i, t := range templates {
		if t.Name == settings.TemplateName {
			tmpl = &templates[i]
			break
		}
	}
	if tmpl == nil {
		return fmt.Errorf("template %q not found", settings.TemplateName)
	}

	vars, err := ResolveVariables(&tmpl.Definition, settings.Overrides, settings.NonInteractive)
	if err != nil {
		return fmt.Errorf("resolve variables: %w", err)
	}

	eng := &Engine{
		TemplateDir: tmpl.Dir,
		Force:       settings.Force,
	}
	if err := eng.Generate(&tmpl.Definition, settings.OutDir, vars); err != nil {
		return fmt.Errorf("generate: %w", err)
	}

	return nil
}
