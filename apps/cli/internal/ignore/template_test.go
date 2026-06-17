package ignore

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestFetch_TeamFE_DefaultStack(t *testing.T) {
	dir := t.TempDir()
	plantFakeTemplate(t, dir, "fe", map[string]string{
		"gitignore/nextjs.gitignore":           "node_modules/\n.next/\n",
		"biomeignore/default.biomeignore":       "**/dist/\n",
		"prettierignore/default.prettierignore": ".cache/\n",
	})

	prev := fetchViaDegit
	fetchViaDegit = func(repo, dest string) (string, error) {
		return "", copyTree(dir, repo, dest)
	}
	defer func() { fetchViaDegit = prev }()

	results, err := Fetch("fe", "nextjs", "/tmp/dest")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(results) != 3 {
		t.Errorf("expected 3 files, got %d: %+v", len(results), results)
	}
	if !containsKey(results, ".gitignore") {
		t.Error("missing .gitignore")
	}
	if !containsKey(results, ".biomeignore") {
		t.Error("missing .biomeignore")
	}
	if !containsKey(results, ".prettierignore") {
		t.Error("missing .prettierignore")
	}
}

func TestFetch_TeamBE_Default(t *testing.T) {
	dir := t.TempDir()
	plantFakeTemplate(t, dir, "be", map[string]string{
		"gitignore/default.gitignore": "radas\n",
	})

	prev := fetchViaDegit
	fetchViaDegit = func(repo, dest string) (string, error) { return "", copyTree(dir, repo, dest) }
	defer func() { fetchViaDegit = prev }()

	results, err := Fetch("be", "default", "/tmp/dest")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(results) != 1 || !containsKey(results, ".gitignore") {
		t.Errorf("expected 1 file (.gitignore), got %+v", results)
	}
}

func TestFetch_UnknownTeam(t *testing.T) {
	_, err := Fetch("unknown-team", "default", "/tmp/dest")
	if err == nil {
		t.Fatal("expected error for unknown team")
	}
}

func TestFetch_UnknownStack(t *testing.T) {
	_, err := Fetch("fe", "no-such-stack", "/tmp/dest")
	if err == nil {
		t.Fatal("expected error for unknown stack")
	}
}

func TestFetch_DownloadFails(t *testing.T) {
	prev := fetchViaDegit
	fetchViaDegit = func(repo, dest string) (string, error) { return "", errors.New("network down") }
	defer func() { fetchViaDegit = prev }()

	_, err := Fetch("fe", "nextjs", "/tmp/dest")
	if err == nil {
		t.Fatal("expected error when download fails")
	}
}

func plantFakeTemplate(t *testing.T, root, team string, files map[string]string) {
	t.Helper()
	for rel, content := range files {
		full := filepath.Join(root, "ignore", team, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func copyTree(src, repoUnused, dest string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if !startsWith(rel, "ignore"+string(filepath.Separator)) {
			return nil
		}
		out := filepath.Join(dest, rel)
		if err := os.MkdirAll(filepath.Dir(out), 0755); err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(out, data, 0644)
	})
}

func containsKey(m map[string]string, k string) bool {
	_, ok := m[k]
	return ok
}

func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
