package cache

import (
	"testing"
)

func TestLocalPutGet(t *testing.T) {
	dir := t.TempDir()
	c := NewLocalCache(dir)
	entry := Entry{Key: "abc123", Project: "api", Task: "test", ExitCode: 0, Outputs: map[string]string{"dist/app": "binary content"}}
	if err := c.Put(entry); err != nil {
		t.Fatal(err)
	}
	got, ok := c.Get("abc123")
	if !ok {
		t.Fatal("Get returned not found")
	}
	if got.Project != "api" {
		t.Errorf("Project=%s", got.Project)
	}
	if got.Outputs["dist/app"] != "binary content" {
		t.Errorf("output content mismatch")
	}
}

func TestLocalGetMiss(t *testing.T) {
	dir := t.TempDir()
	c := NewLocalCache(dir)
	_, ok := c.Get("nonexistent")
	if ok {
		t.Error("expected not found")
	}
}

func TestLocalCount(t *testing.T) {
	dir := t.TempDir()
	c := NewLocalCache(dir)
	for i := 0; i < 3; i++ {
		_ = c.Put(Entry{Key: "k" + string(rune('a'+i)), Project: "p", Task: "t", ExitCode: 0})
	}
	count, _ := c.Count()
	if count != 3 {
		t.Errorf("Count=%d, want 3", count)
	}
}

func TestLocalPrune(t *testing.T) {
	dir := t.TempDir()
	c := NewLocalCache(dir)
	_ = c.Put(Entry{Key: "k1", Project: "p", Task: "t", ExitCode: 0})
	_ = c.Put(Entry{Key: "k2", Project: "p", Task: "t", ExitCode: 0})
	if err := c.Prune(); err != nil {
		t.Fatal(err)
	}
	count, _ := c.Count()
	if count != 0 {
		t.Errorf("after Prune Count=%d, want 0", count)
	}
}
