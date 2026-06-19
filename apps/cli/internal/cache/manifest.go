package cache

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Meta describes the task that produced a cache entry.
type Meta struct {
	Task     string `json:"task"`
	Project  string `json:"project"`
	ExitCode int    `json:"exit_code"`
}

// Logs contains the captured stdout/stderr from a task run.
type Logs struct {
	Stdout []byte
	Stderr []byte
}

// ManifestStore persists per-cache-key logs and metadata alongside the cache entry.
type ManifestStore struct {
	Dir string
}

func NewManifestStore(cacheDir string) *ManifestStore {
	return &ManifestStore{Dir: cacheDir}
}

func (m *ManifestStore) keyDir(key string) string {
	return filepath.Join(m.Dir, key)
}

func (m *ManifestStore) stdoutPath(key string) string {
	return filepath.Join(m.keyDir(key), "stdout.log")
}

func (m *ManifestStore) stderrPath(key string) string {
	return filepath.Join(m.keyDir(key), "stderr.log")
}

func (m *ManifestStore) metaPath(key string) string {
	return filepath.Join(m.keyDir(key), "meta.json")
}

func (m *ManifestStore) SaveLog(key, stream string, data []byte) error {
	if err := os.MkdirAll(m.keyDir(key), 0755); err != nil {
		return err
	}
	var path string
	switch stream {
	case "stdout":
		path = m.stdoutPath(key)
	case "stderr":
		path = m.stderrPath(key)
	default:
		return fmt.Errorf("manifest: unknown stream %q", stream)
	}
	return os.WriteFile(path, data, 0644)
}

func (m *ManifestStore) SaveMeta(key string, meta Meta) error {
	if err := os.MkdirAll(m.keyDir(key), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.metaPath(key), data, 0644)
}

func (m *ManifestStore) Logs(key string) *Logs {
	stdout, _ := os.ReadFile(m.stdoutPath(key))
	stderr, _ := os.ReadFile(m.stderrPath(key))
	if stdout == nil && stderr == nil {
		return nil
	}
	return &Logs{Stdout: stdout, Stderr: stderr}
}

func (m *ManifestStore) Meta(key string) (Meta, bool) {
	data, err := os.ReadFile(m.metaPath(key))
	if err != nil {
		return Meta{}, false
	}
	var meta Meta
	if err := json.Unmarshal(data, &meta); err != nil {
		return Meta{}, false
	}
	return meta, true
}
