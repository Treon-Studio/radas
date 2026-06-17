package checker

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectDatabase(t *testing.T) {
	t.Run("GoPostgres", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test

go 1.25

require (
	github.com/jackc/pgx/v5 v5.7.0
)
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "postgres" {
			t.Errorf("DetectDatabase = %q, want postgres", got)
		}
	})

	t.Run("GoMySQL", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test

go 1.25

require (
	github.com/go-sql-driver/mysql v1.8.0
)
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "mysql" {
			t.Errorf("DetectDatabase = %q, want mysql", got)
		}
	})

	t.Run("GoSQLite", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test

go 1.25

require github.com/mattn/go-sqlite3 v1.14.22
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "sqlite" {
			t.Errorf("DetectDatabase = %q, want sqlite", got)
		}
	})

	t.Run("GoMongoDB", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test

go 1.25

require go.mongodb.org/mongo-driver v1.14.0
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "mongodb" {
			t.Errorf("DetectDatabase = %q, want mongodb", got)
		}
	})

	t.Run("NoGoMod", func(t *testing.T) {
		dir := t.TempDir()
		if got := DetectDatabase(dir); got != "" {
			t.Errorf("DetectDatabase = %q, want empty", got)
		}
	})

	t.Run("GoModNoDB", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test

go 1.25

require github.com/spf13/cobra v1.10.0
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "" {
			t.Errorf("DetectDatabase = %q, want empty", got)
		}
	})

	t.Run("PhpLaravel", func(t *testing.T) {
		dir := t.TempDir()
		composer := `{
			"require": {
				"laravel/framework": "^11.0",
				"laravel/database": "^11.0"
			}
		}`
		os.WriteFile(filepath.Join(dir, "composer.json"), []byte(composer), 0644)
		if got := DetectDatabase(dir); got != "postgres/mysql" {
			t.Errorf("DetectDatabase = %q, want postgres/mysql", got)
		}
	})

	t.Run("ElixirEcto", func(t *testing.T) {
		dir := t.TempDir()
		mix := `defmodule MyApp.MixProject do
  use Mix.Project
  def deps do
    [{:ecto_sql, "~> 3.11"}]
  end
end`
		os.WriteFile(filepath.Join(dir, "mix.exs"), []byte(mix), 0644)
		if got := DetectDatabase(dir); got != "postgres/mysql" {
			t.Errorf("DetectDatabase = %q, want postgres/mysql", got)
		}
	})

	t.Run("GoSupabaseClient", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test
go 1.25
require github.com/supabase-community/supabase-go v0.1.0
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "supabase (postgres)" {
			t.Errorf("DetectDatabase = %q, want supabase (postgres)", got)
		}
	})

	t.Run("SupabaseConfigDir", func(t *testing.T) {
		dir := t.TempDir()
		os.MkdirAll(filepath.Join(dir, "supabase"), 0755)
		os.WriteFile(filepath.Join(dir, "supabase", "config.toml"), []byte("[api]"), 0644)
		if got := DetectDatabase(dir); got != "supabase (postgres)" {
			t.Errorf("DetectDatabase = %q, want supabase (postgres)", got)
		}
	})

	t.Run("GoTursoLibsql", func(t *testing.T) {
		dir := t.TempDir()
		gomod := `module test
go 1.25
require github.com/tursodatabase/libsql-client-go v0.1.0
`
		os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0644)
		if got := DetectDatabase(dir); got != "turso (sqlite)" {
			t.Errorf("DetectDatabase = %q, want turso (sqlite)", got)
		}
	})
}

func TestSuggestDSN(t *testing.T) {
	tests := []struct {
		driver string
		want   string
	}{
		{"postgres", "postgres://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"},
		{"supabase (postgres)", "postgres://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"},
		{"mysql", "user:pass@tcp(localhost:3306)/dbname?parseTime=true"},
		{"sqlite", "./data.db"},
		{"turso (sqlite)", "libsql://[DB-NAME]-[ORG].turso.io?authToken=[TOKEN]"},
		{"unknown", ""},
	}
	for _, tc := range tests {
		got := SuggestDSN(tc.driver)
		if got != tc.want {
			t.Errorf("SuggestDSN(%q) = %q, want %q", tc.driver, got, tc.want)
		}
	}
}
