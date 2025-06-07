package frontend

import (
	"os"
	"gopkg.in/yaml.v2"
)

// isMonorepoYml checks if radas.yml in the given path indicates a monorepo
func isMonorepoYml(path string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	var yml map[string]interface{}
	if err := yaml.Unmarshal(data, &yml); err != nil {
		return false
	}
	if yml["monorepo"] == true || yml["apps"] != nil || yml["packages"] != nil {
		return true
	}
	return false
}
