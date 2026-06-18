package env

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// ReadLocalEnv reads local env files for the given environment.
// Merges files in priority order (lowest to highest):
//   1. .dev.vars
//   2. .env
//   3. .env.{env}
// Higher priority files overwrite lower priority keys.
func ReadLocalEnv(dir, env string) map[string]string {
	result := make(map[string]string)

	// Read files in priority order: lowest priority first
	files := []string{
		filepath.Join(dir, ".dev.vars"),
		filepath.Join(dir, ".env"),
		filepath.Join(dir, ".env."+env),
	}

	for _, path := range files {
		readEnvFile(path, result)
	}

	return result
}

// readEnvFile reads a single env file and populates the map.
func readEnvFile(path string, dst map[string]string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 && strings.TrimSpace(parts[0]) != "" {
			dst[parts[0]] = parts[1]
		}
	}
}
