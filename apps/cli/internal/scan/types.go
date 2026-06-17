// Package scan provides security scanning for radas, currently
// focused on secret detection via the gitleaks library.
package scan

// Finding is a single secret detected during a scan.
type Finding struct {
	File     string
	Line     int
	Rule     string
	Secret   string // redacted by gitleaks
	Severity string // "error" | "warning" | "note"
}

// ScanOptions controls scan scope.
type ScanOptions struct {
	Staged bool   // only scan staged files
	All    bool   // scan full git history
	Config string // path to .gitleaks.toml; "" for default
}

// Scanner is the contract for any secrets scanner. Concrete impl
// in gitleaks.go wraps the upstream library.
type Scanner interface {
	Scan(dir string, opts ScanOptions) ([]Finding, error)
}
