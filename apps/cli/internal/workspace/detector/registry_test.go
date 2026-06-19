package detector

import (
	"testing"

	"github.com/raizora/radas/v4/internal/workspace"
)

type stubDetector struct {
	name    string
	detect  bool
	project *workspace.Project
}

func (s *stubDetector) Name() string { return s.name }
func (s *stubDetector) Detect(string) bool { return s.detect }
func (s *stubDetector) Extract(string, string) (*workspace.Project, error) {
	return s.project, nil
}

func TestRegistryFirstMatchWins(t *testing.T) {
	r := NewRegistry()
	a := &stubDetector{name: "a", detect: true, project: &workspace.Project{Name: "from-a"}}
	b := &stubDetector{name: "b", detect: true, project: &workspace.Project{Name: "from-b"}}
	r.Register(a, b)
	p, err := r.Detect("/x", "/")
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "from-a" {
		t.Errorf("got %s want from-a", p.Name)
	}
}

func TestRegistryNoMatch(t *testing.T) {
	r := NewRegistry()
	r.Register(&stubDetector{name: "a", detect: false})
	if _, err := r.Detect("/x", "/"); err == nil {
		t.Error("expected error")
	}
}
