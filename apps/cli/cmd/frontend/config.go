package frontend

import (
	"github.com/raizora/radas/v4/internal/config"
)

// RadasConfig re-exports internal/config.RadasConfig for legacy compatibility.
type RadasConfig = config.RadasConfig

// ParseConfig delegates to internal/config.
func ParseConfig(configPath string) (*RadasConfig, error) {
	return config.ParseConfig(configPath)
}

// FindConfig delegates to internal/config.
func FindConfig() (string, error) {
	return config.FindConfig()
}

// ResolvePath delegates to internal/config.
func ResolvePath(basePath, configPath string) string {
	return config.ResolvePath(basePath, configPath)
}
