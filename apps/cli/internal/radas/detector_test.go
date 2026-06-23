package radas

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetect_NoConfig(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	r := Detect()
	if r.Detected {
		t.Error("expected no detection in empty dir")
	}
}

func TestDetect_radasYaml(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	content := "version: \"1.0\"\nproject: test-project\n"
	os.WriteFile("radas.yaml", []byte(content), 0644)

	r := Detect()
	if !r.Detected {
		t.Fatal("expected detection")
	}
	if r.Version != "1.0" {
		t.Errorf("version = %q, want 1.0", r.Version)
	}
	if !r.Valid {
		t.Error("expected valid")
	}
}

func TestDetect_radasYmlLegacy(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	content := "name: my-project\ndescription: a test\ntype: backend\nstacks: [go]\n"
	os.WriteFile("radas.yml", []byte(content), 0644)

	r := Detect()
	if !r.Detected {
		t.Fatal("expected detection via legacy fallback")
	}
	if r.Version != "my-project" {
		t.Errorf("version = %q, want my-project", r.Version)
	}
	if !r.Valid {
		t.Error("expected valid legacy config")
	}
}

func TestDetect_HiddenDir(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	os.MkdirAll(".radas", 0755)
	content := "version: \"3.0\"\nproject: hidden-project\n"
	os.WriteFile(filepath.Join(".radas", "radas.yaml"), []byte(content), 0644)

	r := Detect()
	if !r.Detected {
		t.Fatal("expected detection in .radas dir")
	}
	if r.Version != "3.0" {
		t.Errorf("version = %q, want 3.0", r.Version)
	}
}

func TestDetect_InvalidYaml(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	os.WriteFile("radas.yaml", []byte("invalid: [yaml: \n"), 0644)

	r := Detect()
	if !r.Detected {
		t.Fatal("expected detected (file exists)")
	}
	if r.Valid {
		t.Error("expected invalid")
	}
	if r.Error == nil {
		t.Error("expected error")
	}
}

func TestDetect_MissingFields(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	os.WriteFile("radas.yaml", []byte("name: foo\n"), 0644)

	r := Detect()
	if !r.Detected {
		t.Fatal("expected detected")
	}
	if r.Valid {
		t.Error("expected invalid (missing version + project)")
	}
}

func TestDetect_OrderPriority(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	os.WriteFile("radas.yaml", []byte("version: \"1\"\nproject: a\n"), 0644)
	os.MkdirAll(".radas", 0755)
	os.WriteFile(filepath.Join(".radas", "radas.yaml"), []byte("version: \"2\"\nproject: b\n"), 0644)

	r := Detect()
	if !r.Detected || r.Version != "1" {
		t.Errorf("radas.yaml should take priority over .radas/ version=%q", r.Version)
	}
}

func TestDetect_NotYamlDirPriority(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	os.WriteFile("radas.yaml", []byte("version: \"1\"\nproject: a\n"), 0644)
	os.MkdirAll(".radas", 0755)
	os.WriteFile(".radas/radas.yaml", []byte("version: \"2\"\nproject: b\n"), 0644)

	r := Detect()
	if !r.Detected || r.Version != "1" {
		t.Errorf("radas.yaml in cwd should take priority over .radas/ version=%q", r.Version)
	}
}

func TestExpandPath_Tilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}

	result := expandPath("~/.config/test")
	expected := filepath.Join(home, ".config/test")
	if result != expected {
		t.Errorf("expandPath(~/.config/test) = %q, want %q", result, expected)
	}
}

func TestExpandPath_EnvVar(t *testing.T) {
	if v := os.Getenv("HOME"); v == "" {
		os.Setenv("HOME", "/home/test")
		defer os.Unsetenv("HOME")
	}
	os.Setenv("RADAS_DIR", "/custom/path")
	defer os.Unsetenv("RADAS_DIR")

	result := expandPath("$RADAS_DIR/config.yaml")
	expected := filepath.Join("/custom/path", "config.yaml")
	if result != expected {
		t.Errorf("expandPath($RADAS_DIR/config.yaml) = %q, want %q", result, expected)
	}
}

func TestDetectMCPServers(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	content := `version: "1.0"
project: test
mcp:
  servers:
    github:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-github"]
    filesystem:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem"]
`
	os.WriteFile("radas.yaml", []byte(content), 0644)

	servers, err := DetectMCPServers()
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 2 {
		t.Errorf("got %d servers, want 2", len(servers))
	}
}

func TestDetectMCPServers_NoConfig(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(orig)

	_, err := DetectMCPServers()
	if err == nil {
		t.Error("expected error when no config")
	}
}
