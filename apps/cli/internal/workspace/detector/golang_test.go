package detector

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGoDetect(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module x\n\ngo 1.25\n"), 0644)
	d := GoDetector{}
	if d.Detect(dir) == false {
		t.Error("expected true")
	}
	if d.Detect(t.TempDir()) == true {
		t.Error("expected false")
	}
}

func TestGoExtract(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "services", "billing")
	os.MkdirAll(proj, 0755)
	os.WriteFile(filepath.Join(proj, "go.mod"),
		[]byte("module example.com/billing\n\ngo 1.25\n"), 0644)
	p, err := GoDetector{}.Extract(proj, root)
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "example.com/billing" {
		t.Errorf("Name=%s", p.Name)
	}
	if p.Type != "go" {
		t.Errorf("Type=%s", p.Type)
	}
}
