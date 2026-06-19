// Package cache provides a content-addressable local cache for task results.
package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"sort"
)

// HashInput captures everything that should affect a task's output.
// Same input → same hash (cache hit). Different input → different hash.
type HashInput struct {
	Files          []string          // all project source files
	TaskCommand    string            // the actual command string
	EnvVars        map[string]string // relevant env vars
	UpstreamHashes []string          // cache keys of dependency projects' tasks
}

// ComputeHash returns a deterministic SHA256 hex digest of the input.
// File paths, env keys, and upstream hashes are sorted before hashing
// so order does not affect the result.
func ComputeHash(in HashInput) string {
	h := sha256.New()

	sortedFiles := append([]string{}, in.Files...)
	sort.Strings(sortedFiles)
	for _, f := range sortedFiles {
		h.Write([]byte("F:"))
		h.Write([]byte(f))
		content, err := os.ReadFile(f)
		if err == nil {
			h.Write(content)
		}
	}

	h.Write([]byte("C:"))
	h.Write([]byte(in.TaskCommand))

	if len(in.EnvVars) > 0 {
		keys := make([]string, 0, len(in.EnvVars))
		for k := range in.EnvVars {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			h.Write([]byte("E:"))
			h.Write([]byte(k))
			h.Write([]byte("="))
			h.Write([]byte(in.EnvVars[k]))
		}
	}

	sortedUp := append([]string{}, in.UpstreamHashes...)
	sort.Strings(sortedUp)
	for _, u := range sortedUp {
		h.Write([]byte("U:"))
		h.Write([]byte(u))
	}

	return hex.EncodeToString(h.Sum(nil))
}
