package detector

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRadasYMLDetect(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "radas.yml"), []byte("name: x\n"), 0644)
	d := RadasYMLDetector{}
	if d.Detect(dir) == false {
		t.Error("expected true")
	}
	if d.Detect(t.TempDir()) == true {
		t.Error("expected false on empty")
	}
}

func TestRadasYMLExtract(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "apps", "api")
	os.MkdirAll(proj, 0755)
	os.WriteFile(filepath.Join(proj, "radas.yml"),
		[]byte("name: api-service\ntype: backend-api\n"), 0644)
	p, err := RadasYMLDetector{}.Extract(proj, root)
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "api-service" {
		t.Errorf("Name=%s", p.Name)
	}
	if p.Type != "backend-api" {
		t.Errorf("Type=%s", p.Type)
	}
	if p.Path != "apps/api" {
		t.Errorf("Path=%s", p.Path)
	}
}
