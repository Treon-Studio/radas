package workspace

import (
	"testing"

	"github.com/raizora/radas/v4/internal/config"
)

func TestModeString(t *testing.T) {
	if ModeSingle.String() != "single" {
		t.Errorf("ModeSingle.String() = %q, want single", ModeSingle.String())
	}
	if ModeWorkspace.String() != "workspace" {
		t.Errorf("ModeWorkspace.String() = %q, want workspace", ModeWorkspace.String())
	}
}

func TestDetectMode(t *testing.T) {
	cases := []struct {
		name string
		cfg  *config.RadasConfig
		want Mode
	}{
		{"nil workspace", &config.RadasConfig{Name: "x"}, ModeSingle},
		{"workspace with projects",
			&config.RadasConfig{Name: "x", Workspace: &config.WorkspaceConfig{Projects: []string{"apps/*"}}},
			ModeWorkspace},
		{"empty workspace", &config.RadasConfig{Name: "x", Workspace: &config.WorkspaceConfig{}}, ModeSingle},
		{"nil cfg", nil, ModeSingle},
	}
	for _, c := range cases {
		if got := DetectMode(c.cfg); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}
