package checker

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/raizora/radas/v4/internal/utils"
)

// DetectDatabase scans the project for known database dependencies
// and returns the detected database driver name (e.g. "postgres", "mysql", "sqlite").
// Supported stacks: Go (go.mod), PHP/Laravel (composer.json), Elixir (mix.exs).
func DetectDatabase(dir string) string {
	// 1. Check for platform-level configs first (supabase, turso CLI)
	if d := detectPlatformDB(dir); d != "" {
		return d
	}

	// 2. Check dependency files
	if f, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil && !f.IsDir() {
		return detectGoDatabase(dir)
	}
	if f, err := os.Stat(filepath.Join(dir, "composer.json")); err == nil && !f.IsDir() {
		return detectPhpDatabase(dir)
	}
	if f, err := os.Stat(filepath.Join(dir, "mix.exs")); err == nil && !f.IsDir() {
		return detectElixirDatabase(dir)
	}
	return ""
}

// detectPlatformDB checks for platform-level config files (supabase, turso CLI).
func detectPlatformDB(dir string) string {
	// Supabase: project with supabase/ dir and config.toml
	if f, err := os.Stat(filepath.Join(dir, "supabase", "config.toml")); err == nil && !f.IsDir() {
		return "supabase (postgres)"
	}
	// Turso: config file in project root
	if f, err := os.Stat(filepath.Join(dir, "turso.json")); err == nil && !f.IsDir() {
		return "turso (sqlite)"
	}
	if f, err := os.Stat(filepath.Join(dir, ".turso")); err == nil && f.IsDir() {
		return "turso (sqlite)"
	}
	return ""
}

var goDBDrivers = []struct {
	path   string
	name   string
	weight int
}{
	// Supabase (platform — underlying DB is postgres)
	{"github.com/supabase-community/supabase-go", "supabase (postgres)", 4},
	{"github.com/supabase-community/postgrest-go", "supabase (postgres)", 3},
	{"github.com/supabase/supabase-go", "supabase (postgres)", 3},

	// Turso / libsql (edge SQLite)
	{"github.com/tursodatabase/libsql-client-go", "turso (sqlite)", 4},
	{"github.com/libsql/libsql-client-go", "turso (sqlite)", 3},

	// PostgreSQL
	{"github.com/jackc/pgx/", "postgres", 3},
	{"github.com/jackc/pgx", "postgres", 2},
	{"github.com/lib/pq", "postgres", 2},
	{"github.com/go-pg/pg", "postgres", 1},

	// MySQL
	{"github.com/go-sql-driver/mysql", "mysql", 2},
	{"github.com/go-gorm/mysql", "mysql", 1},

	// SQLite
	{"github.com/mattn/go-sqlite3", "sqlite", 2},
	{"github.com/glebarez/go-sqlite", "sqlite", 1},

	// MSSQL
	{"github.com/denisenkom/go-mssqldb", "mssql", 2},
	{"github.com/microsoft/go-mssqldb", "mssql", 2},

	// NoSQL / others
	{"go.mongodb.org/mongo-driver", "mongodb", 2},
	{"github.com/redis/go-redis", "redis", 1},
	{"github.com/gocql/gocql", "cassandra", 1},
	{"github.com/ClickHouse/clickhouse-go", "clickhouse", 1},
	{"github.com/tarantool/go-tarantool", "tarantool", 1},
}

func detectGoDatabase(dir string) string {
	f, err := os.Open(filepath.Join(dir, "go.mod"))
	if err != nil {
		return ""
	}
	defer f.Close()

	type candidate struct {
		name   string
		weight int
	}
	var best candidate

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		for _, d := range goDBDrivers {
			if strings.Contains(line, d.path) && d.weight > best.weight {
				best = candidate{name: d.name, weight: d.weight}
			}
		}
	}
	return best.name
}

var phpDBDrivers = []struct {
	path string
	name string
}{
	{"doctrine/dbal", "postgres/mysql"},
	{"laravel/database", "postgres/mysql"},
	{"mongodb/mongodb", "mongodb"},
	{"illuminate/database", "postgres/mysql"},
}

func detectPhpDatabase(dir string) string {
	data, err := os.ReadFile(filepath.Join(dir, "composer.json"))
	if err != nil {
		return ""
	}
	var composer struct {
		Require map[string]string `json:"require"`
	}
	if err := json.Unmarshal(data, &composer); err != nil {
		return ""
	}
	for _, d := range phpDBDrivers {
		if _, ok := composer.Require[d.path]; ok {
			return d.name
		}
	}
	return ""
}

func detectElixirDatabase(dir string) string {
	data, err := os.ReadFile(filepath.Join(dir, "mix.exs"))
	if err != nil {
		return ""
	}
	content := string(data)
	drivers := map[string]string{
		"ecto_sql":  "postgres/mysql",
		"mongodb":   "mongodb",
		"mongo":     "mongodb",
		"redix":     "redis",
	}
	for dep, db := range drivers {
		if strings.Contains(content, dep) {
			return db
		}
	}
	return ""
}

// SuggestDSN returns a DSN hint for the given database driver.
// envPrefix is the environment variable prefix (e.g. "DB", "DATABASE").
func SuggestDSN(driver string) string {
	switch driver {
	case "postgres", "supabase (postgres)":
		return "postgres://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
	case "mysql":
		return "user:pass@tcp(localhost:3306)/dbname?parseTime=true"
	case "sqlite":
		return "./data.db"
	case "turso (sqlite)":
		return "libsql://[DB-NAME]-[ORG].turso.io?authToken=[TOKEN]"
	case "mongodb":
		return "mongodb://localhost:27017/dbname"
	case "redis":
		return "redis://localhost:6379/0"
	case "mssql":
		return "sqlserver://user:pass@localhost:1433?database=dbname"
	case "clickhouse":
		return "clickhouse://localhost:9000/dbname"
	case "cassandra":
		return "cassandra://localhost:9042/dbname"
	default:
		return ""
	}
}

// PrintDatabaseResult prints the detected database info to stdout (doctor-style).
func PrintDatabaseResult(dir string) {
	db := DetectDatabase(dir)
	fmt.Print("Detecting database: ")
	if db == "" {
		utils.Warning("⚠ Could not detect database driver\n")
		fmt.Println("  (no known driver found in go.mod / composer.json / mix.exs)")
		return
	}
	utils.Success("✓ %s\n", db)
	dsn := SuggestDSN(db)
	if dsn != "" {
		fmt.Printf("  Default DSN: %s\n", dsn)
	}
}
