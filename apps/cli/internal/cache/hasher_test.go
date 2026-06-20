package cache

import (
	"os"
	"path/filepath"
	"testing"
)

func TestComputeHashDeterministic(t *testing.T) {
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, "f1.go"), []byte("hello"), 0644)
	input := HashInput{
		Files:       []string{filepath.Join(tmp, "f1.go")},
		TaskCommand: "go test",
		EnvVars:     map[string]string{"GOOS": "linux"},
	}
	h1 := ComputeHash(input)
	h2 := ComputeHash(input)
	if h1 != h2 {
		t.Errorf("hash not deterministic: %s != %s", h1, h2)
	}
	if len(h1) != 64 {
		t.Errorf("expected 64-char hex, got %d chars", len(h1))
	}
}

func TestComputeHashDifferentCommands(t *testing.T) {
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, "f1.go"), []byte("hello"), 0644)
	a := HashInput{Files: []string{filepath.Join(tmp, "f1.go")}, TaskCommand: "go test"}
	b := HashInput{Files: []string{filepath.Join(tmp, "f1.go")}, TaskCommand: "go build"}
	if ComputeHash(a) == ComputeHash(b) {
		t.Error("different commands should produce different hashes")
	}
}

func TestComputeHashFileOrder(t *testing.T) {
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, "a.go"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(tmp, "b.go"), []byte("b"), 0644)
	a := HashInput{Files: []string{filepath.Join(tmp, "a.go"), filepath.Join(tmp, "b.go")}}
	b := HashInput{Files: []string{filepath.Join(tmp, "b.go"), filepath.Join(tmp, "a.go")}}
	if ComputeHash(a) != ComputeHash(b) {
		t.Error("file order should not affect hash")
	}
}

func TestComputeHashDifferentFiles(t *testing.T) {
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, "a.go"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(tmp, "b.go"), []byte("b"), 0644)
	a := HashInput{Files: []string{filepath.Join(tmp, "a.go")}}
	b := HashInput{Files: []string{filepath.Join(tmp, "b.go")}}
	if ComputeHash(a) == ComputeHash(b) {
		t.Error("different files should produce different hashes")
	}
}
