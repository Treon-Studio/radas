package env

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	cloudflare "github.com/cloudflare/cloudflare-go/v7"
	"github.com/cloudflare/cloudflare-go/v7/option"
	"github.com/cloudflare/cloudflare-go/v7/workers"
	"github.com/raizora/radas/v4/internal/config"
)

// FetchRemoteVars fetches Cloudflare vars and secrets via the official API.
// Falls back silently to wrangler.toml parsing if credentials are missing.
func FetchRemoteVars(dir string, cfg config.CloudflareConfig) (map[string]string, error) {
	token, accountID := resolveCredentials(cfg)
	if token == "" || accountID == "" {
		return readWranglerTomlVars(dir), nil
	}

	client := cloudflare.NewClient(option.WithAPIToken(token))
	ctx := context.Background()
	scriptName := resolveScriptName(dir)

	// Fetch deployments (for history) — ignore error silently
	_, _ = client.Workers.Scripts.Deployments.List(ctx, scriptName, workers.ScriptDeploymentListParams{
		AccountID: cloudflare.F(accountID),
	})

	// Cloudflare API does not expose secret values for security.
	// We merge wrangler.toml [vars] as the only readable remote source.
	result := readWranglerTomlVars(dir)
	return result, nil
}

// FetchDeploymentHistory returns recent deployments.
func FetchDeploymentHistory(dir string, cfg config.CloudflareConfig) ([]DeploymentRecord, error) {
	token, accountID := resolveCredentials(cfg)
	if token == "" || accountID == "" {
		return nil, fmt.Errorf("cloudflare credentials not found")
	}

	client := cloudflare.NewClient(option.WithAPIToken(token))
	ctx := context.Background()
	scriptName := resolveScriptName(dir)

	deployments, err := client.Workers.Scripts.Deployments.List(ctx, scriptName, workers.ScriptDeploymentListParams{
		AccountID: cloudflare.F(accountID),
	})
	if err != nil {
		return nil, err
	}

	var records []DeploymentRecord
	for i, d := range deployments.Deployments {
		vID := d.ID
		records = append(records, DeploymentRecord{
			Index:     i,
			VersionID: vID,
			CreatedAt: fmt.Sprintf("%v", d.CreatedOn),
		})
	}
	return records, nil
}

type DeploymentRecord struct {
	Index     int
	VersionID string
	CreatedAt string
}

// resolveCredentials reads token/account with env var priority:
// 1. CLOUDFLARE_API_TOKEN / CF_API_TOKEN
// 2. radas.yml cloudflare block (passed as cfg)
// 3. Global config (~/.config/radas/config.yml) — caller responsibility
func resolveCredentials(cfg config.CloudflareConfig) (token, accountID string) {
	token = os.Getenv("CLOUDFLARE_API_TOKEN")
	if token == "" {
		token = os.Getenv("CF_API_TOKEN")
	}
	if token == "" {
		token = cfg.APIToken
	}

	accountID = os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	if accountID == "" {
		accountID = os.Getenv("CF_ACCOUNT_ID")
	}
	if accountID == "" {
		accountID = cfg.AccountID
	}
	return
}

// resolveScriptName extracts name from wrangler.toml.
func resolveScriptName(dir string) string {
	path := filepath.Join(dir, "wrangler.toml")
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			// Stop at first section header; name is usually before [vars]
			break
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			if key == "name" {
				val := strings.TrimSpace(parts[1])
				return strings.Trim(val, `"`)
			}
		}
	}
	return ""
}

// readWranglerTomlVars parses the [vars] section from wrangler.toml.
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
				if key == "" {
					continue
				}
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"`)
				result[key] = val
			}
		}
	}
	return result
}
