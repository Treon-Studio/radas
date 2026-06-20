package detector

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNodeDetect(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"x"}`), 0644)
	d := NodeDetector{}
	if d.Detect(dir) == false {
		t.Error("expected true")
	}
	if d.Detect(t.TempDir()) == true {
		t.Error("expected false")
	}
}

func TestNodeExtract(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "apps", "web")
	os.MkdirAll(proj, 0755)
	os.WriteFile(filepath.Join(proj, "package.json"),
		[]byte(`{"name":"@myorg/web","version":"1.0.0"}`), 0644)
	p, err := NodeDetector{}.Extract(proj, root)
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "@myorg/web" {
		t.Errorf("Name=%s", p.Name)
	}
	if p.Type != "node" {
		t.Errorf("Type=%s", p.Type)
	}
}

func TestNodeMissingName(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{}`), 0644)
	d := NodeDetector{}
	_, err := d.Extract(dir, dir)
	if err == nil {
		t.Error("expected error")
	}
}
