package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseConfig(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "radas-test-*")
	defer os.RemoveAll(tmpDir)

	t.Run("Success", func(t *testing.T) {
		content := `
name: test-project
type: be
stacks: [go, gin]
`
		cfgPath := filepath.Join(tmpDir, "radas.yml")
		os.WriteFile(cfgPath, []byte(content), 0644)
		
		cfg, err := ParseConfig(cfgPath)
		if err != nil {
			t.Fatalf("ParseConfig failed: %v", err)
		}
		if cfg.Name != "test-project" {
			t.Errorf("Expected name test-project, got %s", cfg.Name)
		}
	})

	t.Run("DirectoryInput", func(t *testing.T) {
		content := "name: dir-test"
		os.WriteFile(filepath.Join(tmpDir, "radas.yml"), []byte(content), 0644)
		
		cfg, err := ParseConfig(tmpDir)
		if err != nil {
			t.Fatalf("ParseConfig with directory failed: %v", err)
		}
		if cfg.Name != "dir-test" {
			t.Errorf("Expected name dir-test, got %s", cfg.Name)
		}
	})

	t.Run("FileNotFound", func(t *testing.T) {
		_, err := ParseConfig(filepath.Join(tmpDir, "non-existent.yml"))
		if err == nil {
			t.Error("Expected error for non-existent file")
		}
	})

	t.Run("InvalidYAML", func(t *testing.T) {
		cfgPath := filepath.Join(tmpDir, "invalid.yml")
		os.WriteFile(cfgPath, []byte("invalid: yaml: :"), 0644)
		
		_, err := ParseConfig(cfgPath)
		if err == nil {
			t.Error("Expected error for invalid YAML")
		}
	})
}

func TestParseConfigBESections(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "radas-be-*")
	defer os.RemoveAll(tmpDir)

	t.Run("BuildConfig", func(t *testing.T) {
		content := `
name: api
type: backend-api
stacks: [go]
build:
  main: ./cmd/server
  output: ./bin/app
`
		cfgPath := filepath.Join(tmpDir, "be-build.yml")
		os.WriteFile(cfgPath, []byte(content), 0644)

		cfg, err := ParseConfig(cfgPath)
		if err != nil {
			t.Fatalf("ParseConfig failed: %v", err)
		}
		if cfg.Build.Main != "./cmd/server" {
			t.Errorf("Build.Main = %q, want ./cmd/server", cfg.Build.Main)
		}
		if cfg.Build.Output != "./bin/app" {
			t.Errorf("Build.Output = %q, want ./bin/app", cfg.Build.Output)
		}
	})

	t.Run("DBConfig", func(t *testing.T) {
		content := `
name: api
type: backend-api
stacks: [go]
db:
  driver: postgres
  migrations: ./migrations
  seeds: ./seeds
`
		cfgPath := filepath.Join(tmpDir, "be-db.yml")
		os.WriteFile(cfgPath, []byte(content), 0644)

		cfg, err := ParseConfig(cfgPath)
		if err != nil {
			t.Fatalf("ParseConfig failed: %v", err)
		}
		if cfg.DB.Driver != "postgres" {
			t.Errorf("DB.Driver = %q, want postgres", cfg.DB.Driver)
		}
		if cfg.DB.Migrations != "./migrations" {
			t.Errorf("DB.Migrations = %q, want ./migrations", cfg.DB.Migrations)
		}
	})

	t.Run("RunConfig", func(t *testing.T) {
		content := `
name: api
type: backend-api
stacks: [go]
run:
  command: go run ./cmd/server
  watch: true
  watch_tool: air
`
		cfgPath := filepath.Join(tmpDir, "be-run.yml")
		os.WriteFile(cfgPath, []byte(content), 0644)

		cfg, err := ParseConfig(cfgPath)
		if err != nil {
			t.Fatalf("ParseConfig failed: %v", err)
		}
		if cfg.Run.Command != "go run ./cmd/server" {
			t.Errorf("Run.Command = %q, want go run ./cmd/server", cfg.Run.Command)
		}
		if !cfg.Run.Watch {
			t.Error("Run.Watch should be true")
		}
		if cfg.Run.WatchTool != "air" {
			t.Errorf("Run.WatchTool = %q, want air", cfg.Run.WatchTool)
		}
	})

	t.Run("GenConfig", func(t *testing.T) {
		content := `
name: api
type: backend-api
stacks: [go]
gen:
  handler:
    template: templates/handler.gotpl
    output: internal/handler
  service:
    template: templates/service.gotpl
    output: internal/service
`
		cfgPath := filepath.Join(tmpDir, "be-gen.yml")
		os.WriteFile(cfgPath, []byte(content), 0644)

		cfg, err := ParseConfig(cfgPath)
		if err != nil {
			t.Fatalf("ParseConfig failed: %v", err)
		}
		if cfg.Gen.Handler == nil || cfg.Gen.Handler.Output != "internal/handler" {
			t.Errorf("Gen.Handler.Output = %v, want internal/handler", cfg.Gen.Handler)
		}
		if cfg.Gen.Service == nil || cfg.Gen.Service.Template != "templates/service.gotpl" {
			t.Errorf("Gen.Service.Template = %v, want templates/service.gotpl", cfg.Gen.Service)
		}
	})
}

func TestFindConfig(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "radas-find-*")
	tmpDir, _ = filepath.EvalSymlinks(tmpDir) // Normalize for macOS
	defer os.RemoveAll(tmpDir)
	
	subDir := filepath.Join(tmpDir, "a", "b", "c")
	os.MkdirAll(subDir, 0755)
	
	oldWd, _ := os.Getwd()
	defer os.Chdir(oldWd)

	t.Run("FoundInCurrent", func(t *testing.T) {
		os.Chdir(tmpDir)
		os.WriteFile("radas.yml", []byte("name: root"), 0644)
		
		got, err := FindConfig()
		if err != nil {
			t.Fatalf("FindConfig failed: %v", err)
		}
		got, _ = filepath.EvalSymlinks(got)
		absTmpDir, _ := filepath.Abs(tmpDir)
		want := filepath.Join(absTmpDir, "radas.yml")
		if got != want {
			t.Errorf("FindConfig = %s, want %s", got, want)
		}
	})

	t.Run("FoundInParent", func(t *testing.T) {
		os.Chdir(subDir)
		// radas.yml is in tmpDir (parent of subDir)
		got, err := FindConfig()
		if err != nil {
			t.Fatalf("FindConfig failed: %v", err)
		}
		got, _ = filepath.EvalSymlinks(got)
		absTmpDir, _ := filepath.Abs(tmpDir)
		want := filepath.Join(absTmpDir, "radas.yml")
		if got != want {
			t.Errorf("FindConfig = %s, want %s", got, want)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		otherDir, _ := os.MkdirTemp("", "radas-notfound-*")
		defer os.RemoveAll(otherDir)
		os.Chdir(otherDir)
		
		_, err := FindConfig()
		if err == nil {
			t.Error("Expected error when radas.yml is not found")
		}
	})
}

func TestResolvePath(t *testing.T) {
	t.Run("Relative", func(t *testing.T) {
		os.Setenv("RADAS_PLAYGROUND", "")
		base := "/app"
		rel := "src/main.go"
		got := ResolvePath(base, rel)
		want := filepath.Join(base, rel)
		if got != want {
			t.Errorf("ResolvePath relative = %s, want %s", got, want)
		}
	})

	t.Run("Absolute", func(t *testing.T) {
		os.Setenv("RADAS_PLAYGROUND", "")
		base := "/app"
		abs := "/absolute/path"
		got := ResolvePath(base, abs)
		if got != abs {
			t.Errorf("ResolvePath absolute = %s, want %s", got, abs)
		}
	})

	t.Run("PlaygroundVariable", func(t *testing.T) {
		pgDir := "/tmp/playground"
		os.Setenv("RADAS_PLAYGROUND", pgDir)
		defer os.Setenv("RADAS_PLAYGROUND", "")
		
		path := "${RADAS_PLAYGROUND}/config.json"
		got := ResolvePath("/app", path)
		want := filepath.Join(pgDir, "config.json")
		if got != want {
			t.Errorf("ResolvePath playground var = %s, want %s", got, want)
		}
	})

	t.Run("PlaygroundImplicit", func(t *testing.T) {
		pgDir := "/tmp/playground"
		os.Setenv("RADAS_PLAYGROUND", pgDir)
		defer os.Setenv("RADAS_PLAYGROUND", "")
		
		rel := "data.yml"
		got := ResolvePath("/app", rel)
		want := filepath.Join(pgDir, rel)
		if got != want {
			t.Errorf("ResolvePath playground implicit = %s, want %s", got, want)
		}
	})
}

func TestParseConfig_WithCloudflare(t *testing.T) {
	tmpDir := t.TempDir()
	content := `name: test-app
type: backend-api
cloudflare:
  api_token: sk-test-token
  account_id: acc-test-id
`
	cfgPath := filepath.Join(tmpDir, "radas.yml")
	os.WriteFile(cfgPath, []byte(content), 0644)

	cfg, err := ParseConfig(cfgPath)
	if err != nil {
		t.Fatalf("ParseConfig error: %v", err)
	}
	if cfg.Cloudflare.APIToken != "sk-test-token" {
		t.Errorf("APIToken = %q, want sk-test-token", cfg.Cloudflare.APIToken)
	}
	if cfg.Cloudflare.AccountID != "acc-test-id" {
		t.Errorf("AccountID = %q, want acc-test-id", cfg.Cloudflare.AccountID)
	}
}

func TestParseConfig_CloudflareEmpty(t *testing.T) {
	tmpDir := t.TempDir()
	content := `name: test-app
type: backend-api
`
	cfgPath := filepath.Join(tmpDir, "radas.yml")
	os.WriteFile(cfgPath, []byte(content), 0644)

	cfg, err := ParseConfig(cfgPath)
	if err != nil {
		t.Fatalf("ParseConfig error: %v", err)
	}
	if cfg.Cloudflare.APIToken != "" || cfg.Cloudflare.AccountID != "" {
		t.Error("expected empty Cloudflare config when not specified")
	}
}

func TestLoadGlobalConfig_HappyPath(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	configDir := filepath.Join(homeDir, ".config", "radas")
	os.MkdirAll(configDir, 0755)

	content := `cloudflare:
  api_token: global-token
  account_id: global-account
`
	globalPath := filepath.Join(configDir, "config.yml")
	os.WriteFile(globalPath, []byte(content), 0644)

	cfg, err := LoadGlobalConfig()
	if err != nil {
		t.Fatalf("LoadGlobalConfig error: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.Cloudflare.APIToken != "global-token" {
		t.Errorf("APIToken = %q, want global-token", cfg.Cloudflare.APIToken)
	}
	if cfg.Cloudflare.AccountID != "global-account" {
		t.Errorf("AccountID = %q, want global-account", cfg.Cloudflare.AccountID)
	}
}

func TestLoadGlobalConfig_NotFound(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	os.RemoveAll(filepath.Join(homeDir, ".config", "radas"))

	cfg, err := LoadGlobalConfig()
	if err != nil {
		t.Fatalf("expected nil error when config not found, got: %v", err)
	}
	if cfg != nil {
		t.Error("expected nil config when file does not exist")
	}
}

func TestLoadGlobalConfig_InvalidYAML(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	configDir := filepath.Join(homeDir, ".config", "radas")
	os.MkdirAll(configDir, 0755)

	globalPath := filepath.Join(configDir, "config.yml")
	os.WriteFile(globalPath, []byte("not: valid: yaml: :"), 0644)

	_, err := LoadGlobalConfig()
	if err == nil {
		t.Error("expected error for invalid YAML")
	}
}

func TestLoadGlobalConfig_EmptyFile(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	configDir := filepath.Join(homeDir, ".config", "radas")
	os.MkdirAll(configDir, 0755)

	globalPath := filepath.Join(configDir, "config.yml")
	os.WriteFile(globalPath, []byte(""), 0644)

	cfg, err := LoadGlobalConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config for empty file")
	}
	if cfg.Cloudflare.APIToken != "" {
		t.Error("expected empty token for empty file")
	}
}
