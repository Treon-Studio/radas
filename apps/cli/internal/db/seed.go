package db

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/raizora/radas/v4/internal/config"
)

// SeedRun executes a seed file against the database.
// If file is empty, it looks for supabase/seed.sql or seeds/seed.sql.
func SeedRun(dir string, cfg *config.DBConfig, file string) (string, error) {
	dsn := DSN(cfg)
	if dsn == "" {
		return "", fmt.Errorf("DSN required. Set DB_URL, DATABASE_URL, or db.default_dsn in radas.yml")
	}

	path := file
	if path == "" {
		path = findSeedFile(dir, cfg)
	}
	if path == "" {
		return "", fmt.Errorf("no seed file found. Create supabase/seed.sql or seeds/seed.sql")
	}

	if !fileExists(path) {
		return "", fmt.Errorf("seed file not found: %s", path)
	}

	// Try psql first, then Supabase SQL
	if checkCmd("psql") {
		cmd := exec.Command("psql", dsn, "-f", path)
		out, err := cmd.CombinedOutput()
		return strings.TrimSpace(string(out)), err
	}

	return "", fmt.Errorf("no supported client found. Install psql")
}

func findSeedFile(dir string, cfg *config.DBConfig) string {
	candidates := []string{
		filepath.Join(dir, "supabase", "seed.sql"),
		filepath.Join(dir, "seeds", "seed.sql"),
		filepath.Join(dir, "seeds", "seeds.sql"),
		filepath.Join(dir, "db", "seed.sql"),
	}
	// Also check config path
	if cfg != nil && cfg.Seeds != "" {
		seedsDir := filepath.Join(dir, cfg.Seeds)
		candidates = append([]string{filepath.Join(seedsDir, "seed.sql")}, candidates...)
	}
	for _, c := range candidates {
		if fileExists(c) {
			return c
		}
	}
	return ""
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func checkCmd(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}
