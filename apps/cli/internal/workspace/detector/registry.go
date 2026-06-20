package detector

import (
	"fmt"
	"strings"

	"github.com/raizora/radas/v4/internal/project"
)

// Registry holds an ordered list of ProjectDetectors. The first detector to
// return true from Detect() is used; subsequent detectors are skipped.
type Registry struct {
	detectors []ProjectDetector
}

func NewRegistry() *Registry { return &Registry{} }

func (r *Registry) Register(d ...ProjectDetector) {
	r.detectors = append(r.detectors, d...)
}

func (r *Registry) Detect(dir, rootPath string) (*project.Project, error) {
	for _, d := range r.detectors {
		if !d.Detect(dir) {
			continue
		}
		p, err := d.Extract(dir, rootPath)
		if err != nil {
			return nil, fmt.Errorf("%s detector: %w", d.Name(), err)
		}
		if p != nil && p.Name == "" {
			return nil, fmt.Errorf("%s detector: returned project with empty name", d.Name())
		}
		return p, nil
	}
	names := []string{}
	for _, d := range r.detectors {
		names = append(names, d.Name())
	}
	return nil, fmt.Errorf("no detector matched in %s (tried: %s)", dir, strings.Join(names, ", "))
}
