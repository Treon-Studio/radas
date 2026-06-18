package env

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectCloudflare(t *testing.T) {
	tests := []struct {
		name  string
		setup func(dir string)
		want  bool
	}{
		{
			name: "found",
			setup: func(dir string) {
				os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\""), 0644)
			},
			want: true,
		},
		{
			name:  "not_found",
			setup: func(dir string) {},
			want:  false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			tt.setup(dir)
			if got := DetectCloudflare(dir); got != tt.want {
				t.Errorf("DetectCloudflare(%q) = %v; want %v", filepath.Base(dir), got, tt.want)
			}
		})
	}
}

func TestReadLocalEnv(t *testing.T) {
	dir := t.TempDir()

	// .env.production (highest priority)
	os.WriteFile(filepath.Join(dir, ".env.production"), []byte("API_URL=https://api.prod\nDB_HOST=prod-db\n"), 0644)
	// .env (medium priority)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("API_URL=https://api.dev\nDB_HOST=local-db\nDEBUG=true\n"), 0644)
	// .dev.vars (lowest priority)
	os.WriteFile(filepath.Join(dir, ".dev.vars"), []byte("SECRET=xyz\n"), 0644)

	vars := ReadLocalEnv(dir, "production")

	tests := []struct {
		key      string
		expected string
		exists   bool
	}{
		{key: "API_URL", expected: "https://api.prod", exists: true},
		{key: "DB_HOST", expected: "prod-db", exists: true},
		{key: "DEBUG", expected: "true", exists: true},
		{key: "SECRET", expected: "xyz", exists: true},
	}

	for _, tt := range tests {
		got, ok := vars[tt.key]
		if !ok && tt.exists {
			t.Errorf("ReadLocalEnv() missing key %q", tt.key)
			continue
		}
		if ok && got != tt.expected {
			t.Errorf("ReadLocalEnv()[%q] = %q, want %q", tt.key, got, tt.expected)
		}
	}
}

func TestReadLocalEnvNoFiles(t *testing.T) {
	vars := ReadLocalEnv(t.TempDir(), "staging")
	if len(vars) != 0 {
		t.Errorf("ReadLocalEnv() = %v, want empty map", vars)
	}
}

func TestParseWranglerTomlVars(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`name = "my-app"
compatibility_date = "2026-04-13"

[vars]
DATABASE_URL = "postgres://remote"
API_KEY = "sk-remote"
`)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), content, 0644)

	vars := readWranglerTomlVars(dir)
	if len(vars) != 2 {
		t.Fatalf("expected 2 vars, got %d", len(vars))
	}
	if vars["DATABASE_URL"] != "postgres://remote" {
		t.Errorf("DATABASE_URL = %q, want %q", vars["DATABASE_URL"], "postgres://remote")
	}
	if vars["API_KEY"] != "sk-remote" {
		t.Errorf("API_KEY = %q, want %q", vars["API_KEY"], "sk-remote")
	}
}

func TestParseWranglerTomlVarsNoSection(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"my-app\"\n"), 0644)

	vars := readWranglerTomlVars(dir)
	if len(vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(vars))
	}
}

func TestParseWranglerTomlVarsNoFile(t *testing.T) {
	vars := readWranglerTomlVars(t.TempDir())
	if len(vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(vars))
	}
}

func TestCollectEnv(t *testing.T) {
	dir := t.TempDir()

	// Local: .env.production
	os.WriteFile(filepath.Join(dir, ".env.production"), []byte("LOCAL_ONLY=local-val\nSHARED=from-local\n"), 0644)
	// Remote: wrangler.toml [vars]
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte(`name = "test"
[vars]
REMOTE_ONLY = "remote-val"
SHARED = "from-remote"
`), 0644)

	if !DetectCloudflare(dir) {
		t.Fatal("expected Cloudflare detection")
	}

	result := CollectEnv(dir, "production", false)
	if !result.HasCloudflare {
		t.Error("HasCloudflare = false, want true")
	}

	byKey := make(map[string]EnvVar)
	for _, v := range result.Vars {
		byKey[v.Key] = v
	}

	v, ok := byKey["LOCAL_ONLY"]
	if !ok {
		t.Fatal("LOCAL_ONLY missing")
	}
	if v.Source != SourceLocal {
		t.Errorf("LOCAL_ONLY source = %q, want %q", v.Source, SourceLocal)
	}

	v, ok = byKey["REMOTE_ONLY"]
	if !ok {
		t.Fatal("REMOTE_ONLY missing")
	}
	if v.Source != SourceRemote {
		t.Errorf("REMOTE_ONLY source = %q, want %q", v.Source, SourceRemote)
	}

	v, ok = byKey["SHARED"]
	if !ok {
		t.Fatal("SHARED missing")
	}
	if v.Source != SourceBoth {
		t.Errorf("SHARED source = %q, want %q", v.Source, SourceBoth)
	}
	if v.Value != "from-local" {
		t.Errorf("SHARED value = %q, want %q (local takes priority)", v.Value, "from-local")
	}
}

func TestCollectEnvWithOrigin(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("FOO=bar\n"), 0644)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte(`name = "test"
[vars]
BAZ = "qux"
`), 0644)

	result := CollectEnv(dir, "", true)
	byKey := make(map[string]EnvVar)
	for _, v := range result.Vars {
		byKey[v.Key] = v
	}

	if v, ok := byKey["FOO"]; ok {
		if v.Origin == "" {
			t.Error("FOO origin should not be empty with --origin flag")
		}
	} else {
		t.Fatal("FOO missing")
	}

	if v, ok := byKey["BAZ"]; ok {
		if v.Origin == "" {
			t.Error("BAZ origin should not be empty with --origin flag")
		}
	} else {
		t.Fatal("BAZ missing")
	}
}

func TestCollectEnvNoCloudflare(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("FOO=bar\n"), 0644)

	result := CollectEnv(dir, "", false)
	if result.HasCloudflare {
		t.Error("HasCloudflare = true, want false")
	}
	if len(result.Vars) != 1 {
		t.Fatalf("expected 1 var, got %d", len(result.Vars))
	}
	if result.Vars[0].Source != SourceLocal {
		t.Errorf("source = %q, want %q", result.Vars[0].Source, SourceLocal)
	}
}

func TestCollectEnvNoLocalFiles(t *testing.T) {
	result := CollectEnv(t.TempDir(), "", false)
	if len(result.Vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(result.Vars))
	}
}
