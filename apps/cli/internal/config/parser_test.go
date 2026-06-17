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
