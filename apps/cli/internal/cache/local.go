package cache

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Entry describes a cached task result.
type Entry struct {
	Key       string            `json:"key"`
	Project   string            `json:"project"`
	Task      string            `json:"task"`
	ExitCode  int               `json:"exit_code"`
	StartedAt time.Time         `json:"started_at"`
	Duration  time.Duration     `json:"duration_ns"`
	Outputs   map[string]string `json:"outputs,omitempty"`
}

// LocalCache is a filesystem-backed cache store.
type LocalCache struct {
	Dir string
}

func NewLocalCache(dir string) *LocalCache {
	return &LocalCache{Dir: dir}
}

func (c *LocalCache) entryPath(key string) string {
	return filepath.Join(c.Dir, key)
}

// Put writes an entry to disk. Creates the cache dir if needed.
func (c *LocalCache) Put(e Entry) error {
	if e.Key == "" {
		return fmt.Errorf("cache: empty key")
	}
	if err := os.MkdirAll(c.Dir, 0755); err != nil {
		return err
	}
	path := c.entryPath(e.Key)
	data, err := json.MarshalIndent(e, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// Get returns the entry for key, or (zero, false) if not present.
func (c *LocalCache) Get(key string) (Entry, bool) {
	data, err := os.ReadFile(c.entryPath(key))
	if err != nil {
		return Entry{}, false
	}
	var e Entry
	if err := json.Unmarshal(data, &e); err != nil {
		return Entry{}, false
	}
	return e, true
}

// Prune removes all entries. Phase C will add smarter eviction.
func (c *LocalCache) Prune() error {
	entries, err := os.ReadDir(c.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		_ = os.Remove(c.entryPath(e.Name()))
	}
	return nil
}

// Size returns the total size of the cache in bytes.
func (c *LocalCache) Size() (int64, error) {
	entries, err := os.ReadDir(c.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	var total int64
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		total += info.Size()
	}
	return total, nil
}

// Count returns the number of entries in the cache.
func (c *LocalCache) Count() (int, error) {
	entries, err := os.ReadDir(c.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	return len(entries), nil
}
