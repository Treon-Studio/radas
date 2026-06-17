package ignore

import (
	"errors"
	"testing"
)

func TestDegitNotFound(t *testing.T) {
	t.Setenv("PATH", "/nonexistent")
	_, err := fetchViaDegit("github.com/foo/bar", "/tmp/dest")
	if err == nil {
		t.Fatal("expected error when degit not in PATH")
	}
	if !errors.Is(err, errDegitMissing) {
		t.Fatalf("expected errDegitMissing, got %v", err)
	}
}
