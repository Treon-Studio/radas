package db

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
)

// tool represents a supported database migration tool.
type tool string

const (
	toolGoMigrate tool = "golang-migrate"
	toolSupabase  tool = "supabase"
	toolGoose     tool = "goose"
	toolPSQL      tool = "psql"
	toolSQLite    tool = "sqlite3"
	toolTurso     tool = "turso"
	toolUnknown   tool = ""
)

// DetectTool determines the best migration tool for the project at dir
// given the radas.yml database config.
func DetectTool(dir string, cfg *config.DBConfig) tool {
	// 1. Supabase projects use the supabase CLI
	if cfg != nil && cfg.Driver == "supabase" {
		if utils.CheckIfCommandExists("supabase") {
			return toolSupabase
		}
		// fallback: golang-migrate uses go-migrate DSN or raw psql
	}
	// 1b. Also detect supabase by directory marker
	if _, err := os.Stat(filepath.Join(dir, "supabase", "config.toml")); err == nil {
		if utils.CheckIfCommandExists("supabase") {
			return toolSupabase
		}
	}

	// 2. go.mod with golang-migrate import
	if hasGoDep(dir, "golang-migrate/migrate") {
		if utils.CheckIfCommandExists("migrate") {
			return toolGoMigrate
		}
	}

	// 3. go.mod with pressly/goose
	if hasGoDep(dir, "pressly/goose") {
		if utils.CheckIfCommandExists("goose") {
			return toolGoose
		}
	}

	// 4. SQLite via sqlite3 CLI when driver is sqlite
	if cfg != nil && (cfg.Driver == "sqlite" || cfg.Driver == "sqlite3") {
		if utils.CheckIfCommandExists("sqlite3") {
			return toolSQLite
		}
	}

	// 5. Turso via turso CLI when driver is turso
	if cfg != nil && cfg.Driver == "turso" {
		if utils.CheckIfCommandExists("turso") {
			return toolTurso
		}
	}

	// 6. Fall back to psql for Postgres or any SQL DB
	if utils.CheckIfCommandExists("psql") {
		return toolPSQL
	}

	return toolUnknown
}

func hasGoDep(dir, pkg string) bool {
	data, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	if err != nil {
		return false
	}
	return len(data) > 0 && strings.Contains(string(data), pkg)
}

// DSN returns the DSN from config or DB_URL env var.
func DSN(cfg *config.DBConfig) string {
	if dsn := os.Getenv("DB_URL"); dsn != "" {
		return dsn
	}
	if dsn := os.Getenv("SUPABASE_DB_URL"); dsn != "" {
		return dsn
	}
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		return dsn
	}
	if cfg != nil && cfg.DefaultDSN != "" {
		return cfg.DefaultDSN
	}
	return ""
}

// MigrationsDir returns the migrations path from config or default.
func MigrationsDir(dir string, cfg *config.DBConfig) string {
	if cfg != nil && cfg.Migrations != "" {
		return filepath.Join(dir, cfg.Migrations)
	}
	return filepath.Join(dir, "migrations")
}

// SeedsDir returns the seeds path from config or default.
func SeedsDir(dir string, cfg *config.DBConfig) string {
	if cfg != nil && cfg.Seeds != "" {
		return filepath.Join(dir, cfg.Seeds)
	}
	return filepath.Join(dir, "seeds")
}

// extractTursoDBName extracts the database name from a Turso libsql:// DSN.
// DSN format: libsql://<db-name>-<org>.turso.io?authToken=<token>
// Falls back to TURSO_DATABASE_NAME env var if parsing fails.
func extractTursoDBName(dsn string) string {
	if !strings.HasPrefix(dsn, "libsql://") {
		return os.Getenv("TURSO_DATABASE_NAME")
	}
	host := strings.TrimPrefix(dsn, "libsql://")
	if idx := strings.Index(host, ".turso.io"); idx > 0 {
		nameAndOrg := host[:idx]
		// convention: last hyphen separates db-name from org-slug
		if dash := strings.LastIndex(nameAndOrg, "-"); dash > 0 {
			return nameAndOrg[:dash]
		}
		return nameAndOrg
	}
	// also handle libsql://<db-name>?authToken=<token> style
	if idx := strings.IndexAny(host, "?&"); idx > 0 {
		return host[:idx]
	}
	return os.Getenv("TURSO_DATABASE_NAME")
}
