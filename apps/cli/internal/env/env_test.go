package env

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectCloudflareFound(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\""), 0644); err != nil {
		t.Fatal(err)
	}
	if !DetectCloudflare(dir) {
		t.Error("DetectCloudflare() = false, want true")
	}
}

func TestDetectCloudflareNotFound(t *testing.T) {
	if DetectCloudflare(t.TempDir()) {
		t.Error("DetectCloudflare() = true, want false")
	}
}

func TestEnvVarSource(t *testing.T) {
	v := EnvVar{Key: "FOO", Value: "bar", Source: "local", Origin: ".env"}
	if v.Key != "FOO" || v.Value != "bar" || v.Source != "local" || v.Origin != ".env" {
		t.Error("EnvVar struct fields mismatch")
	}
}
