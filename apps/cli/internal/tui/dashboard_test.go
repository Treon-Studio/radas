package tui

import (
	"testing"
)

func TestDashboardView_Empty(t *testing.T) {
	d := NewDashboard(nil, nil)
	v := d.View()
	if v == "" {
		t.Error("expected non-empty view")
	}
	if !contains(v, "No workspace") {
		t.Error("expected 'No workspace' message when no projects")
	}
}

func TestDashboardView_WithProjects(t *testing.T) {
	d := NewDashboard(
		[]string{"api", "web", "admin"},
		[]string{"react-component", "go-api"},
	)
	v := d.View()
	if v == "" {
		t.Error("expected non-empty view")
	}
	if !contains(v, "api") {
		t.Error("expected 'api' project in view")
	}
	if !contains(v, "react-component") {
		t.Error("expected 'react-component' template in view")
	}
}

func TestDashboardView_Init(t *testing.T) {
	d := NewDashboard([]string{"a"}, []string{"b"})
	cmd := d.Init()
	_ = cmd
}

func TestDashboardView_Update(t *testing.T) {
	d := NewDashboard(nil, nil)
	updated, cmd := d.Update(nil)
	_ = updated
	_ = cmd
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
