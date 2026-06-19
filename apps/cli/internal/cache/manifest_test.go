package cache

import "testing"

func TestSaveAndReadLogs(t *testing.T) {
	dir := t.TempDir()
	m := NewManifestStore(dir)
	if err := m.SaveLog("abc", "stdout", []byte("hello\n")); err != nil {
		t.Fatal(err)
	}
	if err := m.SaveLog("abc", "stderr", []byte("warn\n")); err != nil {
		t.Fatal(err)
	}
	logs := m.Logs("abc")
	if logs == nil {
		t.Fatal("no logs")
	}
	if string(logs.Stdout) != "hello\n" {
		t.Errorf("stdout=%q", logs.Stdout)
	}
	if string(logs.Stderr) != "warn\n" {
		t.Errorf("stderr=%q", logs.Stderr)
	}
}

func TestSaveAndReadMeta(t *testing.T) {
	dir := t.TempDir()
	m := NewManifestStore(dir)
	if err := m.SaveMeta("abc", Meta{Task: "test", Project: "api", ExitCode: 0}); err != nil {
		t.Fatal(err)
	}
	meta, ok := m.Meta("abc")
	if !ok {
		t.Fatal("no meta")
	}
	if meta.Task != "test" {
		t.Errorf("Task=%s", meta.Task)
	}
}

func TestLogsMissing(t *testing.T) {
	dir := t.TempDir()
	m := NewManifestStore(dir)
	logs := m.Logs("nope")
	if logs != nil {
		t.Error("expected nil logs for missing key")
	}
}
