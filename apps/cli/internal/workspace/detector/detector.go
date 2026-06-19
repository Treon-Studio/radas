// Package detector provides adapters for identifying and extracting metadata
// from projects of various types. A detector inspects a directory for a
// signature file (e.g. radas.yml, go.mod, package.json) and, if it matches,
// returns a Project populated with name, type, and path.
package detector

import "github.com/raizora/radas/v4/internal/workspace"

// ProjectDetector identifies and describes a project in a directory.
type ProjectDetector interface {
	// Name returns the detector's short identifier (e.g. "radasyml", "go", "node").
	Name() string
	// Detect returns true if this directory contains a project of the
	// type this detector handles. Must be cheap.
	Detect(dir string) bool
	// Extract reads the project manifest and returns a Project populated
	// with name, type, and path. Dependencies are NOT extracted here.
	Extract(dir, rootPath string) (*workspace.Project, error)
}
