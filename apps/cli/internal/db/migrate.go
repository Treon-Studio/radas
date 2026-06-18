package db

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/raizora/radas/v4/internal/config"
	"github.com/raizora/radas/v4/internal/utils"
)

func MigrateUp(dir string, cfg *config.DBConfig, steps int) (string, error) {
	t := DetectTool(dir, cfg)
	dsn := DSN(cfg)
	workDir := MigrationsDir(dir, cfg)

	switch t {
	case toolGoMigrate:
		args := []string{"-path", workDir, "-database", dsn, "up"}
		if steps > 0 {
			args = append(args, fmt.Sprintf("%d", steps))
		}
		return runCmd("migrate", args...)

	case toolSupabase:
		return runSupabasePush(dir, dsn, false)

	case toolGoose:
		if steps <= 0 {
			return runGooseCmd(workDir, dsn, "up")
		}
		// goose doesn't support `up N`; run `up-by-one` N times
		var lastOut string
		for i := 0; i < steps; i++ {
			out, err := runGooseCmd(workDir, dsn, "up-by-one")
			lastOut = out
			if err != nil {
				return out, fmt.Errorf("step %d/%d: %w", i+1, steps, err)
			}
		}
		return lastOut, nil

	case toolPSQL:
		return applySQLFiles(workDir, dsn)

	case toolUnknown:
		return "", fmt.Errorf("no migration tool found. Install one: migrate CLI, supabase CLI, goose, or psql")
	}
	return "", nil
}

func MigrateDown(dir string, cfg *config.DBConfig, steps int) (string, error) {
	t := DetectTool(dir, cfg)
	dsn := DSN(cfg)
	workDir := MigrationsDir(dir, cfg)
	if steps <= 0 {
		steps = 1
	}

	switch t {
	case toolGoMigrate:
		return runCmd("migrate", "-path", workDir, "-database", dsn, "down", fmt.Sprintf("%d", steps))

	case toolGoose:
		return runGooseCmd(workDir, dsn, "down")

	case toolSupabase:
		return "", fmt.Errorf("use 'be db rollback' for Supabase rollback (requires SQL file)")

	case toolPSQL, toolUnknown:
		return "", fmt.Errorf("no rollback support for this tool. Use golang-migrate or goose")
	}
	return "", nil
}

func MigrateCreate(dir string, cfg *config.DBConfig, name string) (string, error) {
	t := DetectTool(dir, cfg)
	workDir := MigrationsDir(dir, cfg)

	if err := os.MkdirAll(workDir, 0755); err != nil {
		return "", fmt.Errorf("create migrations dir: %w", err)
	}

	switch t {
	case toolGoMigrate:
		return runCmd("migrate", "create", "-dir", workDir, "-ext", ".sql", name)

	case toolGoose:
		// create doesn't need DSN — just the dir and filename
		cmd := exec.Command("goose", "-dir", workDir, "create", name, "sql")
		out, err := cmd.CombinedOutput()
		output := strings.TrimSpace(string(out))
		if err != nil {
			if output != "" {
				return output, fmt.Errorf("%s: %s", strings.TrimSuffix(err.Error(), "\n"), output)
			}
			return output, err
		}
		return output, nil

	case toolSupabase:
		return createSupabaseMigration(workDir, name)

	case toolPSQL, toolUnknown:
		return createPlainSQLMigration(workDir, name)
	}
	return "", nil
}

func MigrateList(dir string, cfg *config.DBConfig) (string, error) {
	t := DetectTool(dir, cfg)
	dsn := DSN(cfg)
	workDir := MigrationsDir(dir, cfg)

	switch t {
	case toolGoMigrate:
		return runCmd("migrate", "-path", workDir, "-database", dsn, "version")

	case toolGoose:
		return runGooseCmd(workDir, dsn, "status")

	case toolSupabase:
		return runSupabaseCmd(dir, dsn, "migration", "list")

	case toolPSQL:
		files, err := os.ReadDir(workDir)
		if err != nil {
			return "", fmt.Errorf("read migrations dir: %w", err)
		}
		var b strings.Builder
		for _, f := range files {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
				fmt.Fprintln(&b, f.Name())
			}
		}
		return b.String(), nil

	case toolUnknown:
		return "", fmt.Errorf("no migration tool found")
	}
	return "", nil
}

func MigratePush(dir string, cfg *config.DBConfig, dryRun bool) (string, error) {
	t := DetectTool(dir, cfg)
	if t != toolSupabase {
		return "", fmt.Errorf("push is only supported for Supabase projects")
	}
	dsn := DSN(cfg)
	args := []string{"db", "push"}
	if dryRun {
		args = append(args, "--dry-run")
	}
	return runSupabaseCmd(dir, dsn, args...)
}

// --- helpers ----------------------------------------------------------------

func runCmd(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		if output != "" {
			return output, fmt.Errorf("%s: %s", strings.TrimSuffix(err.Error(), "\n"), output)
		}
		return output, err
	}
	return output, nil
}

func runSupabaseCmd(dir, dsn string, args ...string) (string, error) {
	if dsn != "" {
		args = append(args, "--db-url", dsn)
	}
	cmd := exec.Command("supabase", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		if output != "" {
			return output, fmt.Errorf("%s: %s", strings.TrimSuffix(err.Error(), "\n"), output)
		}
		return output, err
	}
	return output, nil
}

// runGooseCmd runs goose with auto-detected driver and DSN via env vars.
// goose accepts driver+dsn as positional args OR env vars GOOSE_DRIVER/GOOSE_DBSTRING.
// We use env vars so the caller doesn't need to parse the DSN scheme.
func runGooseCmd(dir, dsn, command string) (string, error) {
	args := []string{"-dir", dir, command}
	cmd := exec.Command("goose", args...)
	cmd.Env = os.Environ()
	if dsn != "" {
		driver := gooseDriver(dsn)
		if driver != "" {
			cmd.Env = append(cmd.Env, "GOOSE_DRIVER="+driver, "GOOSE_DBSTRING="+dsn)
		}
	}
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		if output != "" {
			return output, fmt.Errorf("%s: %s", strings.TrimSuffix(err.Error(), "\n"), output)
		}
		return output, err
	}
	return output, nil
}

// gooseDriver maps a DSN scheme to the goose driver name.
func gooseDriver(dsn string) string {
	switch {
	case strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://"):
		return "postgres"
	case strings.HasPrefix(dsn, "mysql://"):
		return "mysql"
	case strings.HasPrefix(dsn, "sqlite://") || strings.HasPrefix(dsn, "sqlite3://"):
		return "sqlite3"
	case strings.HasPrefix(dsn, "sqlserver://"):
		return "sqlserver"
	case strings.HasPrefix(dsn, "redshift://"):
		return "redshift"
	case strings.HasPrefix(dsn, "clickhouse://"):
		return "clickhouse"
	case strings.HasPrefix(dsn, "mongodb://"):
		return "mongodb"
	default:
		return ""
	}
}

func runSupabasePush(dir, dsn string, dryRun bool) (string, error) {
	args := []string{"db", "push"}
	if dryRun {
		args = append(args, "--dry-run")
	}
	return runSupabaseCmd(dir, dsn, args...)
}

func createSupabaseMigration(dir, name string) (string, error) {
	ts := time.Now().Format("20060102150405")
	filename := fmt.Sprintf("%s_%s.sql", ts, name)
	path := filepath.Join(dir, filename)
	content := fmt.Sprintf("-- Migration: %s\n-- Created: %s\n\n", name, ts)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("create migration file: %w", err)
	}
	return fmt.Sprintf("Created %s", filename), nil
}

func createPlainSQLMigration(dir, name string) (string, error) {
	ts := time.Now().Format("20060102150405")
	upFile := fmt.Sprintf("%s_%s.up.sql", ts, name)
	downFile := fmt.Sprintf("%s_%s.down.sql", ts, name)
	upPath := filepath.Join(dir, upFile)
	downPath := filepath.Join(dir, downFile)

	for _, p := range []string{upPath, downPath} {
		if err := os.WriteFile(p, []byte("-- +migrate Up\n-- +migrate Down\n"), 0644); err != nil {
			return "", fmt.Errorf("create migration file: %w", err)
		}
	}
	return fmt.Sprintf("Created %s, %s", upFile, downFile), nil
}

func applySQLFiles(migrationsDir, dsn string) (string, error) {
	if dsn == "" {
		return "", fmt.Errorf("DSN required. Set DB_URL, DATABASE_URL, or db.default_dsn in radas.yml")
	}
	if !utils.CheckIfCommandExists("psql") {
		return "", fmt.Errorf("psql not found. Install PostgreSQL client")
	}

	if _, statErr := os.Stat(migrationsDir); os.IsNotExist(statErr) {
		return "", fmt.Errorf("migrations directory %q does not exist. Create it or set db.migrations in radas.yml", migrationsDir)
	}

	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		return "", fmt.Errorf("read migrations dir: %w", err)
	}

	var applied int
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".sql") {
			continue
		}
		if strings.HasSuffix(f.Name(), ".down.sql") {
			continue
		}
		path := filepath.Join(migrationsDir, f.Name())
		cmd := exec.Command("psql", dsn, "-f", path)
		out, err := cmd.CombinedOutput()
		output := strings.TrimSpace(string(out))
		if err != nil {
			if output != "" {
				return output, fmt.Errorf("apply %s: %s", f.Name(), output)
			}
			return output, fmt.Errorf("apply %s: %w", f.Name(), err)
		}
		applied++
	}
	return fmt.Sprintf("Applied %d migration(s)", applied), nil
}
