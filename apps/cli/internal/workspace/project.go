package workspace

// Project represents a single project within a workspace. It is the unit of
// work that the radas workspace command group operates on: build, test, lint,
// graph traversal, affected detection, and code generation all use Project
// as the primary key.
type Project struct {
	// Name is the unique identifier used in graphs, command flags, and CLI
	// output. Set by the detector that first matches the directory.
	Name string `json:"name"`
	// Type categorizes the project for command dispatch. The workspace
	// command group uses WorkspaceConfig.TaskTypes to map Type to a radas
	// command group (e.g. "backend-api" -> "be").
	Type string `json:"type"`
	// Path is the directory containing the project, relative to the
	// workspace root. Always uses forward slashes internally.
	Path string `json:"path"`
	// Dependencies lists the Names of other projects in the same workspace
	// that this project depends on. Empty if no internal dependencies.
	Dependencies []string `json:"dependencies,omitempty"`
}

// ID returns the unique identifier for this project. It is an alias for Name
// and exists so that Project satisfies the dominikbraun/graph hash function
// signature.
func (p Project) ID() string { return p.Name }
