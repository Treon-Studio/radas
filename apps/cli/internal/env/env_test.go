package env

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/raizora/radas/v4/internal/config"
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

	os.WriteFile(filepath.Join(dir, ".env.production"), []byte("API_URL=https://api.prod\nDB_HOST=prod-db\n"), 0644)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("API_URL=https://api.dev\nDB_HOST=local-db\nDEBUG=true\n"), 0644)
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

func TestReadLocalEnv_CommentsAndEmptyLines(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("\n# comment\nFOO=bar\n\n# another\nBAZ=qux\n"), 0644)

	vars := ReadLocalEnv(dir, "")
	if vars["FOO"] != "bar" {
		t.Errorf("FOO = %q, want bar", vars["FOO"])
	}
	if vars["BAZ"] != "qux" {
		t.Errorf("BAZ = %q, want qux", vars["BAZ"])
	}
	if len(vars) != 2 {
		t.Errorf("expected 2 vars, got %d", len(vars))
	}
}

func TestReadLocalEnv_ValueWithEquals(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("JSON={\"a\":1}\nURL=https://x.com?q=1\n"), 0644)

	vars := ReadLocalEnv(dir, "")
	if vars["JSON"] != `{"a":1}` {
		t.Errorf("JSON = %q", vars["JSON"])
	}
	if vars["URL"] != "https://x.com?q=1" {
		t.Errorf("URL = %q", vars["URL"])
	}
}

func TestReadLocalEnv_PriorityOrder(t *testing.T) {
	dir := t.TempDir()

	os.WriteFile(filepath.Join(dir, ".dev.vars"), []byte("KEY=dev\nSHARED=dev-val\n"), 0644)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("KEY=env\nENV_ONLY=env-val\n"), 0644)
	os.WriteFile(filepath.Join(dir, ".env.staging"), []byte("KEY=staging\nSTAGE_ONLY=stage-val\n"), 0644)

	vars := ReadLocalEnv(dir, "staging")

	if vars["KEY"] != "staging" {
		t.Errorf("KEY priority failed: got %q, want staging", vars["KEY"])
	}
	if vars["SHARED"] != "dev-val" {
		t.Errorf("SHARED = %q, want dev-val", vars["SHARED"])
	}
	if vars["ENV_ONLY"] != "env-val" {
		t.Errorf("ENV_ONLY = %q, want env-val", vars["ENV_ONLY"])
	}
	if vars["STAGE_ONLY"] != "stage-val" {
		t.Errorf("STAGE_ONLY = %q, want stage-val", vars["STAGE_ONLY"])
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

	os.WriteFile(filepath.Join(dir, ".env.production"), []byte("LOCAL_ONLY=local-val\nSHARED=from-local\n"), 0644)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte(`name = "test"
[vars]
REMOTE_ONLY = "remote-val"
SHARED = "from-remote"
`), 0644)

	if !DetectCloudflare(dir) {
		t.Fatal("expected Cloudflare detection")
	}

	result := CollectEnv(dir, "production", false, config.CloudflareConfig{})

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

	result := CollectEnv(dir, "", true, config.CloudflareConfig{})
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

	result := CollectEnv(dir, "", false, config.CloudflareConfig{})
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
	result := CollectEnv(t.TempDir(), "", false, config.CloudflareConfig{})
	if len(result.Vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(result.Vars))
	}
}

func TestCollectEnvWithCredentials(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("LOCAL=val\n"), 0644)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n[vars]\nREMOTE = \"remote-val\"\n"), 0644)

	cfg := config.CloudflareConfig{
		APIToken:  "fake-token",
		AccountID: "fake-account",
	}
	result := CollectEnv(dir, "", false, cfg)
	if !result.HasCloudflare {
		t.Fatal("HasCloudflare should be true")
	}

	byKey := map[string]EnvVar{}
	for _, v := range result.Vars {
		byKey[v.Key] = v
	}
	if _, ok := byKey["REMOTE"]; !ok {
		t.Error("REMOTE should still be present via wrangler.toml fallback")
	}
}

func TestCollectEnv_NoWranglerButHasCloudflareToml(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n"), 0644)

	result := CollectEnv(dir, "", false, config.CloudflareConfig{})
	if !result.HasCloudflare {
		t.Error("HasCloudflare should be true")
	}
	if len(result.Vars) != 0 {
		t.Errorf("expected 0 vars (no [vars] section), got %d", len(result.Vars))
	}
}

func TestCollectEnv_SortedKeys(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("Z=last\nA=first\nM=middle\n"), 0644)

	result := CollectEnv(dir, "", false, config.CloudflareConfig{})
	if len(result.Vars) != 3 {
		t.Fatalf("expected 3 vars, got %d", len(result.Vars))
	}
	keys := []string{result.Vars[0].Key, result.Vars[1].Key, result.Vars[2].Key}
	expected := []string{"A", "M", "Z"}
	for i, k := range keys {
		if k != expected[i] {
			t.Errorf("sort order[%d] = %q, want %q", i, k, expected[i])
		}
	}
}

func TestCollectEnv_DuplicateKeysAcrossSources(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".env"), []byte("SHARED=from-env\n"), 0644)
	os.WriteFile(filepath.Join(dir, ".env.staging"), []byte("SHARED=from-staging\n"), 0644)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n[vars]\nSHARED = \"from-remote\"\n"), 0644)

	result := CollectEnv(dir, "staging", false, config.CloudflareConfig{})
	byKey := map[string]EnvVar{}
	for _, v := range result.Vars {
		byKey[v.Key] = v
	}
	if byKey["SHARED"].Value != "from-staging" {
		t.Errorf("SHARED = %q, want from-staging (highest local priority)", byKey["SHARED"].Value)
	}
}

func TestOriginForLocal(t *testing.T) {
	dir := t.TempDir()

	if got := originForLocal(dir, "prod"); got != "local file" {
		t.Errorf("no files: got %q, want %q", got, "local file")
	}

	os.WriteFile(filepath.Join(dir, ".dev.vars"), []byte("A=1\n"), 0644)
	if got := originForLocal(dir, "prod"); got != ".dev.vars" {
		t.Errorf(".dev.vars only: got %q, want %q", got, ".dev.vars")
	}

	os.WriteFile(filepath.Join(dir, ".env"), []byte("B=2\n"), 0644)
	if got := originForLocal(dir, "prod"); got != ".env" {
		t.Errorf(".env wins: got %q, want %q", got, ".env")
	}

	os.WriteFile(filepath.Join(dir, ".env.prod"), []byte("C=3\n"), 0644)
	if got := originForLocal(dir, "prod"); got != ".env.prod" {
		t.Errorf(".env.prod wins: got %q, want %q", got, ".env.prod")
	}
}

func TestEnvResult_Defaults(t *testing.T) {
	r := EnvResult{}
	if r.Env != "" || len(r.Vars) != 0 || r.HasCloudflare || r.RemoteError != "" {
		t.Error("EnvResult default values unexpected")
	}
}

func TestDetectCloudflare_AbsolutePath(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n"), 0644)

	absPath, _ := filepath.Abs(dir)
	if !DetectCloudflare(absPath) {
		t.Error("DetectCloudflare failed with absolute path")
	}
}

func TestReadEnvFile_SkipsCommentsAndEmpty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.env")
	os.WriteFile(path, []byte("# comment\n\nKEY=value\n\n"), 0644)

	m := make(map[string]string)
	readEnvFile(path, m)
	if m["KEY"] != "value" {
		t.Errorf("KEY = %q, want value", m["KEY"])
	}
	if len(m) != 1 {
		t.Errorf("expected 1 entry, got %d", len(m))
	}
}

func TestReadEnvFile_MissingFile(t *testing.T) {
	m := make(map[string]string)
	readEnvFile("/nonexistent/file.env", m)
	if len(m) != 0 {
		t.Errorf("expected empty map, got %d", len(m))
	}
}

func TestReadEnvFile_MalformedLines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.env")
	os.WriteFile(path, []byte("VALID=ok\nNO_EQUALS\n=empty_key\n"), 0644)

	m := make(map[string]string)
	readEnvFile(path, m)
	if m["VALID"] != "ok" {
		t.Errorf("VALID = %q, want ok", m["VALID"])
	}
	if _, ok := m["NO_EQUALS"]; ok {
		t.Error("should not parse line without '='")
	}
	if _, ok := m[""]; ok {
		t.Error("should not parse empty key")
	}
}
