package env

import (
	"os"
	"path/filepath"
	"sort"
)

// Source indicates where an environment variable was found.
type Source string

const (
	SourceLocal  Source = "local"
	SourceRemote Source = "remote"
	SourceBoth   Source = "both"
)

// EnvVar represents a single environment variable with its provenance.
type EnvVar struct {
	Key    string
	Value  string
	Source Source
	Origin string // file path or "wrangler secret" / "wrangler.toml [vars]"
}

// EnvResult aggregates all discovered environment variables and metadata.
// Env is the deployment environment label, e.g. "production" or "staging".
type EnvResult struct {
	Env           string
	Vars          []EnvVar
	HasCloudflare bool
	RemoteError   string
}

// DetectCloudflare returns true if the directory contains a wrangler.toml
// file, indicating a Cloudflare Workers project.
func DetectCloudflare(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "wrangler.toml"))
	return err == nil
}

// CollectEnv merges local and remote env vars into a single annotated list.
// Local files take priority over remote values when a key exists in both.
func CollectEnv(dir, env string, withOrigin bool) *EnvResult {
	result := &EnvResult{
		Env: env,
	}

	// Detect Cloudflare
	result.HasCloudflare = DetectCloudflare(dir)

	// Read local
	localVars := ReadLocalEnv(dir, env)

	// Read remote (only if Cloudflare)
	var remoteVars map[string]string
	if result.HasCloudflare {
		var err error
		remoteVars, err = FetchRemoteVars(dir)
		if err != nil {
			result.RemoteError = err.Error()
		}
	}

	localOrigin := originForLocal(dir, env)
	remoteOrigin := "wrangler.toml [vars]"

	seen := make(map[string]bool)

	// Add local vars first
	for k, v := range localVars {
		sv := EnvVar{Key: k, Value: v, Source: SourceLocal}
		if _, ok := remoteVars[k]; ok {
			sv.Source = SourceBoth
		}
		if withOrigin {
			sv.Origin = localOrigin
			if sv.Source == SourceBoth {
				sv.Origin += ", " + remoteOrigin
			}
		}
		result.Vars = append(result.Vars, sv)
		seen[k] = true
	}

	// Add remote-only vars
	for k, v := range remoteVars {
		if seen[k] {
			continue
		}
		sv := EnvVar{Key: k, Value: v, Source: SourceRemote}
		if withOrigin {
			sv.Origin = remoteOrigin
		}
		result.Vars = append(result.Vars, sv)
	}

	// Sort by key
	sort.Slice(result.Vars, func(i, j int) bool {
		return result.Vars[i].Key < result.Vars[j].Key
	})

	return result
}

// originForLocal returns the highest-priority local env file that exists.
func originForLocal(dir, env string) string {
	if _, err := os.Stat(filepath.Join(dir, ".env."+env)); err == nil {
		return ".env." + env
	}
	if _, err := os.Stat(filepath.Join(dir, ".env")); err == nil {
		return ".env"
	}
	if _, err := os.Stat(filepath.Join(dir, ".dev.vars")); err == nil {
		return ".dev.vars"
	}
	return "local file"
}
