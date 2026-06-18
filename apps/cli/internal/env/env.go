package env

import (
	"os"
	"path/filepath"
)

// EnvVar represents a single environment variable with its provenance.
type EnvVar struct {
	Key    string
	Value  string
	Source string // "local", "remote", "both"
	Origin string // file path or "wrangler secret" / "wrangler.toml [vars]"
}

// EnvResult aggregates all discovered environment variables and metadata.
type EnvResult struct {
	Env           string
	Vars          []EnvVar
	HasCloudflare bool
	RemoteError   string
}

// DetectCloudflare returns true if the directory contains a wrangler.toml
// file, indicating a Cloudflare Workers project.
func DetectCloudflare(dir string) bool {
	if _, err := os.Stat(filepath.Join(dir, "wrangler.toml")); err == nil {
		return true
	}
	return false
}
