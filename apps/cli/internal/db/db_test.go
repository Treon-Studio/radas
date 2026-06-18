package db

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/raizora/radas/v4/internal/config"
)

func TestDSN(t *testing.T) {
	tests := []struct {
		name     string
		env      map[string]string
		cfg      *config.DBConfig
		expected string
	}{
		{
			name:     "no env, no config",
			env:      map[string]string{},
			cfg:      nil,
			expected: "",
		},
		{
			name:     "DB_URL takes priority",
			env:      map[string]string{"DB_URL": "postgres://localhost/mydb"},
			cfg:      &config.DBConfig{DefaultDSN: "fallback"},
			expected: "postgres://localhost/mydb",
		},
		{
			name:     "SUPABASE_DB_URL fallback",
			env:      map[string]string{"SUPABASE_DB_URL": "postgres://supabase/mydb"},
			cfg:      nil,
			expected: "postgres://supabase/mydb",
		},
		{
			name:     "DATABASE_URL fallback",
			env:      map[string]string{"DATABASE_URL": "postgres://default/mydb"},
			cfg:      nil,
			expected: "postgres://default/mydb",
		},
		{
			name:     "config fallback",
			env:      map[string]string{},
			cfg:      &config.DBConfig{DefaultDSN: "postgres://cfg/mydb"},
			expected: "postgres://cfg/mydb",
		},
		{
			name:     "env overrides config",
			env:      map[string]string{"DATABASE_URL": "postgres://env/mydb"},
			cfg:      &config.DBConfig{DefaultDSN: "postgres://cfg/mydb"},
			expected: "postgres://env/mydb",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for k, v := range tt.env {
				t.Setenv(k, v)
			}
			got := DSN(tt.cfg)
			if got != tt.expected {
				t.Errorf("DSN() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestMigrationsDir(t *testing.T) {
	tests := []struct {
		name     string
		cfg      *config.DBConfig
		expected string
	}{
		{
			name:     "default migrations dir",
			cfg:      nil,
			expected: "migrations",
		},
		{
			name:     "empty config",
			cfg:      &config.DBConfig{},
			expected: "migrations",
		},
		{
			name:     "custom migrations dir",
			cfg:      &config.DBConfig{Migrations: "db/migrations"},
			expected: "db/migrations",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := MigrationsDir("/project", tt.cfg); got != filepath.Join("/project", tt.expected) {
				t.Errorf("MigrationsDir() = %q, want %q", got, filepath.Join("/project", tt.expected))
			}
		})
	}
}

func TestSeedsDir(t *testing.T) {
	tests := []struct {
		name     string
		cfg      *config.DBConfig
		expected string
	}{
		{name: "default seeds dir", cfg: nil, expected: "seeds"},
		{name: "custom seeds dir", cfg: &config.DBConfig{Seeds: "db/seeds"}, expected: "db/seeds"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SeedsDir("/project", tt.cfg); got != filepath.Join("/project", tt.expected) {
				t.Errorf("SeedsDir() = %q, want %q", got, filepath.Join("/project", tt.expected))
			}
		})
	}
}

func TestHasGoDep(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "go.mod"), []byte(`
module example
go 1.25
require (
    github.com/golang-migrate/migrate/v4 v4.0.0
)
`), 0644); err != nil {
		t.Fatal(err)
	}
	if !hasGoDep(dir, "golang-migrate/migrate") {
		t.Error("expected to detect golang-migrate dependency")
	}
	if hasGoDep(dir, "pressly/goose") {
		t.Error("expected not to detect goose dependency")
	}
}

func TestHasGoDepNoGoMod(t *testing.T) {
	if hasGoDep(t.TempDir(), "anything") {
		t.Error("expected false when no go.mod")
	}
}

func TestDetectToolNoProject(t *testing.T) {
	got := DetectTool(t.TempDir(), nil)
	// If psql is installed on the machine, it will return toolPSQL
	if got != toolUnknown && got != toolPSQL {
		t.Errorf("expected unknown or psql, got %q", got)
	}
}

func TestCreatePlainSQLMigration(t *testing.T) {
	dir := t.TempDir()
	out, err := createPlainSQLMigration(dir, "create_users")
	if err != nil {
		t.Fatal(err)
	}

	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(files))
	}

	var hasUp, hasDown bool
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".up.sql") {
			hasUp = true
		}
		if strings.HasSuffix(f.Name(), ".down.sql") {
			hasDown = true
		}
	}
	if !hasUp || !hasDown {
		t.Errorf("expected up and down files, hasUp=%v hasDown=%v", hasUp, hasDown)
	}
	if out == "" {
		t.Error("expected non-empty output")
	}
}

func TestCreateSupabaseMigration(t *testing.T) {
	dir := t.TempDir()
	out, err := createSupabaseMigration(dir, "add_roles_table")
	if err != nil {
		t.Fatal(err)
	}

	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(files))
	}

	data, err := os.ReadFile(filepath.Join(dir, files[0].Name()))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "add_roles_table") {
		t.Errorf("expected migration name in content, got %q", string(data))
	}
	if out == "" {
		t.Error("expected non-empty output")
	}
}

func TestFindSeedFile(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "seeds"), 0755)
	seedPath := filepath.Join(dir, "seeds", "seed.sql")
	os.WriteFile(seedPath, []byte("-- seed"), 0644)

	if got := findSeedFile(dir, nil); got != seedPath {
		t.Errorf("findSeedFile() = %q, want %q", got, seedPath)
	}
}

func TestFindSeedFileSupabase(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "supabase"), 0755)
	seedPath := filepath.Join(dir, "supabase", "seed.sql")
	os.WriteFile(seedPath, []byte("-- seed"), 0644)

	if got := findSeedFile(dir, nil); got != seedPath {
		t.Errorf("findSeedFile() = %q, want %q", got, seedPath)
	}
}

func TestFindSeedFileCustom(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "my-seeds"), 0755)
	seedPath := filepath.Join(dir, "my-seeds", "seed.sql")
	os.WriteFile(seedPath, []byte("-- seed"), 0644)

	cfg := &config.DBConfig{Seeds: "my-seeds"}
	if got := findSeedFile(dir, cfg); got != seedPath {
		t.Errorf("findSeedFile() = %q, want %q", got, seedPath)
	}
}

func TestFindSeedFileNotFound(t *testing.T) {
	if got := findSeedFile(t.TempDir(), nil); got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

func TestExtractTursoDBName(t *testing.T) {
	tests := []struct {
		name     string
		dsn      string
		envVal   string
		expected string
	}{
		{
			name:     "full turso dsn with org",
			dsn:      "libsql://my-db-org.turso.io?authToken=abc123",
			expected: "my-db",
		},
		{
			name:     "turso dsn with multiple hyphens in db name",
			dsn:      "libsql://my-app-db-org.turso.io?authToken=xyz",
			expected: "my-app-db",
		},
		{
			name:     "no turso dsn, use env var",
			dsn:      "postgres://localhost/mydb",
			envVal:   "my-turso-db",
			expected: "my-turso-db",
		},
		{
			name:     "empty dsn, env var fallback",
			dsn:      "",
			envVal:   "fallback-db",
			expected: "fallback-db",
		},
		{
			name:     "no env, no turso prefix",
			dsn:      "postgres://localhost/mydb",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				t.Setenv("TURSO_DATABASE_NAME", tt.envVal)
			}
			got := extractTursoDBName(tt.dsn)
			if got != tt.expected {
				t.Errorf("extractTursoDBName() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestGooseDriverSQLite(t *testing.T) {
	tests := []struct {
		dsn      string
		expected string
	}{
		{dsn: "sqlite:///data/app.db", expected: "sqlite3"},
		{dsn: "sqlite3:///data/app.db", expected: "sqlite3"},
		{dsn: "libsql://my-db.turso.io?authToken=abc", expected: ""}, // not a standard goose driver
	}
	for _, tt := range tests {
		t.Run(tt.dsn, func(t *testing.T) {
			if got := gooseDriver(tt.dsn); got != tt.expected {
				t.Errorf("gooseDriver(%q) = %q, want %q", tt.dsn, got, tt.expected)
			}
		})
	}
}

func TestDetectToolSQLiteConfig(t *testing.T) {
	// When driver is sqlite but sqlite3 CLI isn't available,
	// it should fall through to psql or unknown
	cfg := &config.DBConfig{Driver: "sqlite"}
	got := DetectTool(t.TempDir(), cfg)
	// Can't assert exact value since it depends on what's installed,
	// but it should NOT return toolGoMigrate or toolGoose unexpectedly
	if got == toolGoMigrate || got == toolGoose {
		t.Errorf("unexpected tool for sqlite config: %q", got)
	}
}

func TestDetectToolTursoConfig(t *testing.T) {
	cfg := &config.DBConfig{Driver: "turso"}
	got := DetectTool(t.TempDir(), cfg)
	if got == toolGoMigrate || got == toolGoose {
		t.Errorf("unexpected tool for turso config: %q", got)
	}
}

func TestApplySQLiteFilesNoDSN(t *testing.T) {
	_, err := applySQLiteFiles("/tmp/no-exist", "")
	if err == nil || !strings.Contains(err.Error(), "DSN required") {
		t.Errorf("expected DSN required error, got: %v", err)
	}
}

func TestApplyTursoFilesNoDSN(t *testing.T) {
	_, err := applyTursoFiles("/tmp/no-exist", "")
	if err == nil || !strings.Contains(err.Error(), "DSN required") {
		t.Errorf("expected DSN required error, got: %v", err)
	}
}

func TestMigrateDownSQLiteAndTurso(t *testing.T) {
	for _, toolName := range []tool{toolSQLite, toolTurso} {
		t.Run(string(toolName), func(t *testing.T) {
			dir := t.TempDir()
			cfg := &config.DBConfig{Driver: "sqlite"}
			_, err := MigrateDown(dir, cfg, 1)
			if err == nil {
				t.Error("expected error for SQLite/Turso rollback")
			}
		})
	}
}

func TestMigrateCreateToolUnsupported(t *testing.T) {
	dir := t.TempDir()
	// createPlainSQLMigration path (same used by toolSQLite/toolTurso)
	migDir := filepath.Join(dir, "migrations")
	os.MkdirAll(migDir, 0755)

	out, err := createPlainSQLMigration(migDir, "test_unsupported")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "test_unsupported") {
		t.Errorf("expected test_unsupported in output, got %q", out)
	}
}

func TestFileExists(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "exists.txt")
	os.WriteFile(path, []byte("hello"), 0644)

	if !fileExists(path) {
		t.Error("fileExists() = false, want true")
	}
	if fileExists(filepath.Join(dir, "nope.txt")) {
		t.Error("fileExists() = true, want false")
	}
}
