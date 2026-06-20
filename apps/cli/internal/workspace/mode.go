// Package workspace provides monorepo scanning, project detection, and
// dependency graph construction for the radas CLI's `workspace` command group.
package workspace

import "github.com/raizora/radas/v4/internal/config"

// Mode describes how the radas CLI is operating in the current directory.
type Mode int

const (
	// ModeSingle is the default. The current directory has a radas.yml
	// without a workspace: section. Existing commands (be, fe, design, infra,
	// scan, rootcmd) run as before. The `workspace` command group is unavailable.
	ModeSingle Mode = iota
	// ModeWorkspace is active when the root radas.yml has a workspace:
	// section with at least one project pattern. The `workspace` command
	// group is fully available.
	ModeWorkspace
)

// String returns a human-readable label for the mode.
func (m Mode) String() string {
	if m == ModeWorkspace {
		return "workspace"
	}
	return "single"
}

// DetectMode inspects a loaded RadasConfig and returns the active mode.
// A workspace config with at least one project pattern triggers workspace mode.
// Anything else (including a nil Workspace pointer) is single-project mode.
func DetectMode(cfg *config.RadasConfig) Mode {
	if cfg == nil || cfg.Workspace == nil || len(cfg.Workspace.Projects) == 0 {
		return ModeSingle
	}
	return ModeWorkspace
}
