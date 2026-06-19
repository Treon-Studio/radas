package generator

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Registry holds template directories and provides scanning and remote-fetching.
type Registry struct {
	TemplateDirs []string
}

// Template is a discovered code-generation template with its parsed definition and directory.
type Template struct {
	Definition
	Dir string
}

// Add fetches a remote template repository via git clone and returns the first
// discovered template. The cloned directory (minus .git) is stored at targetDir/<repo>.
func (r *Registry) Add(remoteURL string, targetDir string) (Template, error) {
	if remoteURL == "" {
		return Template{}, fmt.Errorf("remote URL is required")
	}

	if targetDir == "" {
		return Template{}, fmt.Errorf("target directory is required")
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

	if err := os.RemoveAll(filepath.Join(localDir, ".git")); err != nil {
		return Template{}, fmt.Errorf("remove .git: %w", err)
	}

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

// Scan walks all configured TemplateDirs and returns discovered templates.
// Non-existent directories are silently skipped; directories without valid
// template.yml files are also skipped.
func (r *Registry) Scan() ([]Template, error) {
	var templates []Template

	for _, dir := range r.TemplateDirs {
		scanned, err := r.scanDir(dir)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, fmt.Errorf("scan %s: %w", dir, err)
		}
		templates = append(templates, scanned...)
	}

	return templates, nil
}
