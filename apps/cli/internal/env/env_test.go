package env

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectCloudflareFound(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\""), 0644)
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
	if v.Key != "FOO" || v.Source != "local" {
		t.Error("EnvVar struct fields mismatch")
	}
}
