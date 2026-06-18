package env

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// FetchRemoteVars fetches vars from Cloudflare via wrangler.toml [vars] section.
// For now, secret values via wrangler CLI are not readable, so only [vars]
// from wrangler.toml are returned.
func FetchRemoteVars(dir string) (map[string]string, error) {
	result := readWranglerTomlVars(dir)

	// Try wrangler secret list — returns metadata only, not values.
	// Kept as a placeholder; real secret fetching needs wrangler whoami + API.
	_, _ = runWranglerSecrets(dir)

	return result, nil
}

// readWranglerTomlVars parses the [vars] section from wrangler.toml.
// This is a minimal line-based parser that extracts key = "value" pairs.
func readWranglerTomlVars(dir string) map[string]string {
	path := filepath.Join(dir, "wrangler.toml")
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	result := make(map[string]string)
	inVars := false
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			inVars = line == "[vars]"
			continue
		}
		if inVars {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"`)
				result[key] = val
			}
		}
	}
	return result
}

// runWranglerSecrets is a placeholder for running `wrangler secret list`.
// Currently returns empty because secret values are not exposed via CLI.
func runWranglerSecrets(dir string) (map[string]string, error) {
	if _, err := os.Stat(filepath.Join(dir, "wrangler.toml")); os.IsNotExist(err) {
		return nil, err
	}
	return nil, nil
}
