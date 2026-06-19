package generator

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Registry struct {
	TemplateDirs []string
}

type Template struct {
	Definition
	Dir string
}

// Add fetches a remote template repository and adds it to the registry.
func (r *Registry) Add(remoteURL string, targetDir string) (Template, error) {
	if remoteURL == "" {
		return Template{}, fmt.Errorf("remote URL is required")
	}

	repoURL := normalizeURL(remoteURL)
	repoName := extractRepoName(repoURL)
	localDir := filepath.Join(targetDir, repoName)

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return Template{}, fmt.Errorf("create target dir: %w", err)
	}

	cmd := exec.Command("git", "clone", "--depth", "1", repoURL, localDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return Template{}, fmt.Errorf("clone %s: %s: %w", remoteURL, string(output), err)
	}

	os.RemoveAll(filepath.Join(localDir, ".git"))

	templates, err := r.scanDir(localDir)
	if err != nil {
		return Template{}, fmt.Errorf("scan cloned templates: %w", err)
	}

	if len(templates) == 0 {
		return Template{}, fmt.Errorf("no valid templates found in %s", localDir)
	}

	return templates[0], nil
}

func normalizeURL(raw string) string {
	if strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "http://") {
		return raw
	}

	raw = strings.TrimPrefix(raw, "gh:")
	raw = strings.TrimPrefix(raw, "github:")

	if !strings.Contains(raw, "/") {
		return raw
	}

	if !strings.Contains(raw, ".") {
		return "https://github.com/" + raw
	}

	return raw
}

func extractRepoName(repoURL string) string {
	u, err := url.Parse(repoURL)
	if err != nil {
		parts := strings.Split(repoURL, "/")
		return strings.TrimSuffix(parts[len(parts)-1], ".git")
	}

	name := filepath.Base(u.Path)
	return strings.TrimSuffix(name, ".git")
}

func (r *Registry) scanDir(dir string) ([]Template, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir: %w", err)
	}

	var templates []Template
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		defPath := filepath.Join(dir, entry.Name(), "template.yml")
		def, err := Parse(defPath)
		if err != nil {
			continue
		}

		templates = append(templates, Template{
			Definition: *def,
			Dir:        filepath.Join(dir, entry.Name()),
		})
	}
	return templates, nil
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
