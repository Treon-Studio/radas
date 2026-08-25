package system

import (
	"os"
	"path/filepath"
	"strings"
)

func getWhitelistPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".config/radas")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "whitelist.txt"), nil
}

// LoadWhitelist reads whitelist path rules from disk.
func LoadWhitelist() []string {
	path, err := getWhitelistPath()
	if err != nil {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	lines := strings.Split(string(data), "\n")
	var result []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			result = append(result, trimmed)
		}
	}
	return result
}

// AddWhitelistRule adds a path or pattern to the whitelist.
func AddWhitelistRule(rule string) error {
	path, err := getWhitelistPath()
	if err != nil {
		return err
	}

	current := LoadWhitelist()
	for _, c := range current {
		if c == rule {
			return nil
		}
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = f.WriteString(rule + "\n")
	return err
}
