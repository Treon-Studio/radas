// Runtime configuration resolves the connection and tenant context used by
// every remote CLI command: where the control plane lives, the bearer token,
// and the active organization/project selectors.
//
// Resolution precedence for each field is: explicit command flag >
// environment variable > persisted selector (organization/project only) >
// built-in default (API URL only). The token is never persisted to disk,
// never logged, and never printed; it exists only in memory and in the
// Authorization header built by the shared client.
//
// The persisted Selector stores identifiers only and is advisory: the server
// remains the authorization authority for every request and validates both
// organization membership and project access per call.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/raizora/radas/v4/internal/client"
)

// Environment variables recognized as fallbacks for the runtime flags.
const (
	// EnvAPIURL overrides the control-plane API base URL.
	EnvAPIURL = "RADAS_API_URL"
	// EnvToken carries the bearer token for API requests.
	EnvToken = "RADAS_TOKEN"
	// EnvOrganizationID overrides the active organization selector.
	EnvOrganizationID = "RADAS_ORG_ID"
	// EnvProjectID overrides the active project selector.
	EnvProjectID = "RADAS_PROJECT_ID"
)

// Names of the persistent flags registered on the root command.
const (
	FlagAPIURL    = "api-url"
	FlagToken     = "token"
	FlagOrgID     = "org-id"
	FlagProjectID = "project-id"
)

// DefaultAPIURL is the local control-plane endpoint used when neither the
// flag nor the environment provides a URL.
const DefaultAPIURL = "http://localhost:5001"

// SelectorFileName is the name of the CLI-local selector file stored inside
// the RADAS config directory.
const SelectorFileName = "selector.json"

// RuntimeConfig is the resolved execution context for remote CLI commands.
type RuntimeConfig struct {
	APIURL         string
	Token          string
	OrganizationID string
	ProjectID      string
}

// Selector is the persisted CLI-local selection of the active organization
// and project. It stores identifiers only — never tokens or credentials —
// and is advisory: the server remains the authorization authority and every
// project-scoped request is validated server-side regardless of this value.
type Selector struct {
	OrganizationID string `json:"org_id,omitempty"`
	ProjectID      string `json:"project_id,omitempty"`
}

// RegisterPersistentFlags attaches the shared runtime flags to the root
// command so every subcommand inherits them. All flags default to empty;
// resolution and fallbacks happen in LoadRuntimeConfig.
func RegisterPersistentFlags(root *cobra.Command) {
	root.PersistentFlags().String(FlagAPIURL, "", "RADAS control-plane API URL (env: "+EnvAPIURL+")")
	root.PersistentFlags().String(FlagToken, "", "RADAS API bearer token (env: "+EnvToken+")")
	root.PersistentFlags().String(FlagOrgID, "", "Active organization ID (env: "+EnvOrganizationID+")")
	root.PersistentFlags().String(FlagProjectID, "", "Active project ID (env: "+EnvProjectID+")")
}

// LoadRuntimeConfig resolves the runtime configuration for the command being
// executed. Precedence per field: flag > environment > persisted selector
// (organization/project only) > built-in default (API URL only). The token is
// never persisted, logged, or printed.
func LoadRuntimeConfig(cmd *cobra.Command) (RuntimeConfig, error) {
	if cmd == nil {
		return RuntimeConfig{}, fmt.Errorf("runtime config: command is nil")
	}

	sel, err := LoadSelector()
	if err != nil {
		return RuntimeConfig{}, fmt.Errorf("load CLI selector: %w", err)
	}

	return RuntimeConfig{
		APIURL:         firstNonEmpty(flagValue(cmd, FlagAPIURL), os.Getenv(EnvAPIURL), DefaultAPIURL),
		Token:          firstNonEmpty(flagValue(cmd, FlagToken), os.Getenv(EnvToken)),
		OrganizationID: firstNonEmpty(flagValue(cmd, FlagOrgID), os.Getenv(EnvOrganizationID), sel.OrganizationID),
		ProjectID:      firstNonEmpty(flagValue(cmd, FlagProjectID), os.Getenv(EnvProjectID), sel.ProjectID),
	}, nil
}

// NewClient builds the shared control-plane client from the resolved runtime
// configuration. Organization and project IDs propagate as default tenant
// headers (X-Org-Id / X-Project-Id) on every request; the token is only ever
// written to the Authorization header.
func (rc RuntimeConfig) NewClient() *client.Client {
	return client.New(client.Config{
		BaseURL:        rc.APIURL,
		AuthToken:      rc.Token,
		ProjectID:      rc.ProjectID,
		OrganizationID: rc.OrganizationID,
		Timeout:        30 * time.Second,
	})
}

// flagValue returns the current string value of a named flag from the
// command's effective flag sets. Empty (unset) values are treated as absent
// so fallbacks continue down the precedence chain. Commands constructed
// without the shared persistent flags resolve to empty values, which keeps
// focused unit tests and legacy call sites working.
func flagValue(cmd *cobra.Command, name string) string {
	for _, fs := range []*pflag.FlagSet{cmd.Flags(), cmd.PersistentFlags(), cmd.InheritedFlags()} {
		if fs == nil {
			continue
		}
		if f := fs.Lookup(name); f != nil {
			return f.Value.String()
		}
	}
	return ""
}

// selectorPath returns the selector file location. RADAS_CONFIG_DIR overrides
// the directory for tests and sandboxed environments; otherwise the selector
// lives alongside the existing CLI config in ~/.config/radas/.
func selectorPath() (string, error) {
	dir := os.Getenv("RADAS_CONFIG_DIR")
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home directory: %w", err)
		}
		dir = filepath.Join(home, ".config", "radas")
	}
	return filepath.Join(dir, SelectorFileName), nil
}

// LoadSelector reads the persisted active organization/project selection. A
// missing file yields an empty Selector and no error; a malformed file is an
// error so a corrupt selector is never silently ignored.
func LoadSelector() (Selector, error) {
	path, err := selectorPath()
	if err != nil {
		return Selector{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Selector{}, nil
		}
		return Selector{}, fmt.Errorf("read selector file %s: %w", path, err)
	}

	var sel Selector
	if err := json.Unmarshal(data, &sel); err != nil {
		return Selector{}, fmt.Errorf("parse selector file %s: %w", path, err)
	}
	return sel, nil
}

// SaveSelector persists the active organization/project identifiers. The file
// contains IDs only and is written with restrictive permissions; tokens and
// other credentials must never be passed through this type.
func SaveSelector(sel Selector) error {
	path, err := selectorPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}

	data, err := json.MarshalIndent(sel, "", "  ")
	if err != nil {
		return fmt.Errorf("encode selector: %w", err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write selector file: %w", err)
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
