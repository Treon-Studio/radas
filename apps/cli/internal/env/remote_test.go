package env

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/raizora/radas/v4/internal/config"
)

func TestResolveCredentials_EnvVarPriority(t *testing.T) {
	oldToken := os.Getenv("CLOUDFLARE_API_TOKEN")
	oldAccount := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	oldCFToken := os.Getenv("CF_API_TOKEN")
	oldCFAccount := os.Getenv("CF_ACCOUNT_ID")
	defer func() {
		os.Setenv("CLOUDFLARE_API_TOKEN", oldToken)
		os.Setenv("CLOUDFLARE_ACCOUNT_ID", oldAccount)
		os.Setenv("CF_API_TOKEN", oldCFToken)
		os.Setenv("CF_ACCOUNT_ID", oldCFAccount)
	}()
	os.Unsetenv("CF_API_TOKEN")
	os.Unsetenv("CF_ACCOUNT_ID")

	os.Setenv("CLOUDFLARE_API_TOKEN", "env-token")
	os.Setenv("CLOUDFLARE_ACCOUNT_ID", "env-account")
	tok, acc := resolveCredentials(config.CloudflareConfig{APIToken: "cfg-token", AccountID: "cfg-account"})
	if tok != "env-token" || acc != "env-account" {
		t.Errorf("env var priority failed: tok=%q acc=%q", tok, acc)
	}

	os.Unsetenv("CLOUDFLARE_API_TOKEN")
	os.Unsetenv("CLOUDFLARE_ACCOUNT_ID")
	tok, acc = resolveCredentials(config.CloudflareConfig{APIToken: "cfg-token", AccountID: "cfg-account"})
	if tok != "cfg-token" || acc != "cfg-account" {
		t.Errorf("config fallback failed: tok=%q acc=%q", tok, acc)
	}

	tok, acc = resolveCredentials(config.CloudflareConfig{})
	if tok != "" || acc != "" {
		t.Errorf("expected empty, got tok=%q acc=%q", tok, acc)
	}
}

func TestResolveCredentials_CFPrefix(t *testing.T) {
	oldToken := os.Getenv("CLOUDFLARE_API_TOKEN")
	oldCFToken := os.Getenv("CF_API_TOKEN")
	oldCFAccount := os.Getenv("CF_ACCOUNT_ID")
	oldAccount := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	defer func() {
		os.Setenv("CLOUDFLARE_API_TOKEN", oldToken)
		os.Setenv("CF_API_TOKEN", oldCFToken)
		os.Setenv("CF_ACCOUNT_ID", oldCFAccount)
		os.Setenv("CLOUDFLARE_ACCOUNT_ID", oldAccount)
	}()
	os.Unsetenv("CLOUDFLARE_API_TOKEN")
	os.Unsetenv("CLOUDFLARE_ACCOUNT_ID")
	os.Setenv("CF_API_TOKEN", "cf-token")
	os.Setenv("CF_ACCOUNT_ID", "cf-account")

	tok, acc := resolveCredentials(config.CloudflareConfig{})
	if tok != "cf-token" {
		t.Errorf("CF_API_TOKEN fallback failed: got %q", tok)
	}
	if acc != "cf-account" {
		t.Errorf("CF_ACCOUNT_ID fallback failed: got %q", acc)
	}
}

func TestResolveCredentials_EmptyConfigAndEnv(t *testing.T) {
	oldToken := os.Getenv("CLOUDFLARE_API_TOKEN")
	oldAccount := os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	oldCFToken := os.Getenv("CF_API_TOKEN")
	oldCFAccount := os.Getenv("CF_ACCOUNT_ID")
	defer func() {
		os.Setenv("CLOUDFLARE_API_TOKEN", oldToken)
		os.Setenv("CLOUDFLARE_ACCOUNT_ID", oldAccount)
		os.Setenv("CF_API_TOKEN", oldCFToken)
		os.Setenv("CF_ACCOUNT_ID", oldCFAccount)
	}()
	os.Unsetenv("CLOUDFLARE_API_TOKEN")
	os.Unsetenv("CLOUDFLARE_ACCOUNT_ID")
	os.Unsetenv("CF_API_TOKEN")
	os.Unsetenv("CF_ACCOUNT_ID")

	tok, acc := resolveCredentials(config.CloudflareConfig{})
	if tok != "" || acc != "" {
		t.Errorf("expected empty credentials, got tok=%q acc=%q", tok, acc)
	}
}

func TestResolveScriptName(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"my-worker\"\n"), 0644)

	if got := resolveScriptName(dir); got != "my-worker" {
		t.Errorf("resolveScriptName = %q, want %q", got, "my-worker")
	}

	if got := resolveScriptName(t.TempDir()); got != "" {
		t.Errorf("no wrangler.toml: got %q, want empty", got)
	}
}

func TestResolveScriptName_NoNameField(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("[vars]\nFOO = \"bar\"\n"), 0644)

	if got := resolveScriptName(dir); got != "" {
		t.Errorf("got %q, want empty (no name field)", got)
	}
}

func TestFetchRemoteVars_NoCredentials(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n[vars]\nFOO = \"bar\"\n"), 0644)

	vars, err := FetchRemoteVars(dir, config.CloudflareConfig{})
	if err != nil {
		t.Fatalf("expected silent fallback, got error: %v", err)
	}
	if vars["FOO"] != "bar" {
		t.Errorf("FOO = %q, want bar", vars["FOO"])
	}
}

func TestFetchRemoteVars_NoWranglerAndNoCreds(t *testing.T) {
	dir := t.TempDir()

	vars, err := FetchRemoteVars(dir, config.CloudflareConfig{})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if len(vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(vars))
	}
}

func TestFetchRemoteVars_EmptyDir(t *testing.T) {
	vars, err := FetchRemoteVars(t.TempDir(), config.CloudflareConfig{APIToken: "x", AccountID: "y"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_ = vars
}

func TestFetchRemoteVars_MergeAPIToml(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte(`name = "test"
[vars]
FROM_TOML = "toml-value"
`), 0644)

	vars, err := FetchRemoteVars(dir, config.CloudflareConfig{APIToken: "fake", AccountID: "fake"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if vars["FROM_TOML"] != "toml-value" {
		t.Errorf("FROM_TOML = %q, want toml-value", vars["FROM_TOML"])
	}
}

func TestFetchRemoteVars_NoVarsSection(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"empty-vars\"\n"), 0644)

	vars, err := FetchRemoteVars(dir, config.CloudflareConfig{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(vars))
	}
}

func TestFetchDeploymentHistory_NoCredentials(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n"), 0644)

	_, err := FetchDeploymentHistory(dir, config.CloudflareConfig{})
	if err == nil {
		t.Error("expected error for missing credentials, got nil")
	}
}

func TestFetchDeploymentHistory_NoWrangler(t *testing.T) {
	_, err := FetchDeploymentHistory(t.TempDir(), config.CloudflareConfig{APIToken: "x", AccountID: "y"})
	if err == nil {
		t.Error("expected error when wrangler.toml missing and script name unknown")
	}
}

func TestReadWranglerTomlVars_NonExistentDir(t *testing.T) {
	vars := readWranglerTomlVars("/nonexistent/path/that/does/not/exist")
	if len(vars) != 0 {
		t.Errorf("expected 0 vars, got %d", len(vars))
	}
}

func TestReadWranglerTomlVars_EmptyVarsSection(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("name = \"test\"\n[vars]\n"), 0644)

	vars := readWranglerTomlVars(dir)
	if len(vars) != 0 {
		t.Errorf("expected 0 vars in empty [vars], got %d", len(vars))
	}
}

func TestReadWranglerTomlVars_MalformedLines(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`[vars]
no_equals_sign
KEY= "value-with-extra-spaces"
=empty_key
`)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), content, 0644)

	vars := readWranglerTomlVars(dir)
	if vars["KEY"] != "value-with-extra-spaces" {
		t.Errorf("KEY = %q, want %q", vars["KEY"], "value-with-extra-spaces")
	}
	if _, ok := vars["no_equals_sign"]; ok {
		t.Error("should not parse line without '='")
	}
	if _, ok := vars[""]; ok {
		t.Error("should not parse line with empty key")
	}
}

func TestReadWranglerTomlVars_CommentsAndEmptyLines(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`name = "test"
# comment
[vars]
FOO = "bar"

# another comment
BAZ = "qux"
`)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), content, 0644)

	vars := readWranglerTomlVars(dir)
	if len(vars) != 2 {
		t.Fatalf("expected 2 vars, got %d", len(vars))
	}
	if vars["FOO"] != "bar" {
		t.Errorf("FOO = %q, want bar", vars["FOO"])
	}
	if vars["BAZ"] != "qux" {
		t.Errorf("BAZ = %q, want qux", vars["BAZ"])
	}
}

func TestReadWranglerTomlVars_WrongSection(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`[env.production.vars]
FOO = "wrong"
[vars]
BAR = "right"
`)
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), content, 0644)

	vars := readWranglerTomlVars(dir)
	if _, ok := vars["FOO"]; ok {
		t.Error("should not parse vars from [env.production.vars]")
	}
	if vars["BAR"] != "right" {
		t.Errorf("BAR = %q, want right", vars["BAR"])
	}
}

func TestReadWranglerTomlVars_QuotedValue(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "wrangler.toml"), []byte("[vars]\nKEY = \"quoted\"\n"), 0644)

	vars := readWranglerTomlVars(dir)
	if vars["KEY"] != "quoted" {
		t.Errorf("KEY = %q, want quoted", vars["KEY"])
	}
}

func TestDeploymentRecordStruct(t *testing.T) {
	d := DeploymentRecord{
		Index:     0,
		VersionID: "abc-123",
		CreatedAt: "2026-06-18T00:00:00Z",
	}
	if d.VersionID != "abc-123" {
		t.Error("DeploymentRecord fields mismatch")
	}
}
