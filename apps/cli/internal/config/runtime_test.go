package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// newRuntimeRootCmd builds a bare root command with the shared persistent
// runtime flags registered, mirroring production root wiring.
func newRuntimeRootCmd(t *testing.T) *cobra.Command {
	t.Helper()
	root := &cobra.Command{Use: "radas"}
	RegisterPersistentFlags(root)
	return root
}

// isolateEnv clears every runtime env var so tests are hermetic regardless of
// the developer shell, and points the selector store at a temp directory.
func isolateEnv(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("RADAS_CONFIG_DIR", dir)
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "")
	return dir
}

func TestLoadRuntimeConfigDefaults(t *testing.T) {
	isolateEnv(t)

	root := newRuntimeRootCmd(t)
	rc, err := LoadRuntimeConfig(root)
	if err != nil {
		t.Fatalf("LoadRuntimeConfig: %v", err)
	}
	if rc.APIURL != DefaultAPIURL {
		t.Errorf("APIURL = %q, want default %q", rc.APIURL, DefaultAPIURL)
	}
	if rc.Token != "" {
		t.Errorf("Token = %q, want empty", rc.Token)
	}
	if rc.OrganizationID != "" {
		t.Errorf("OrganizationID = %q, want empty", rc.OrganizationID)
	}
	if rc.ProjectID != "" {
		t.Errorf("ProjectID = %q, want empty", rc.ProjectID)
	}
}

func TestLoadRuntimeConfigPrecedenceFlagOverEnvOverDefault(t *testing.T) {
	isolateEnv(t)
	t.Setenv("RADAS_API_URL", "http://env-url:5001")
	t.Setenv("RADAS_TOKEN", "env-token")
	t.Setenv("RADAS_ORG_ID", "env-org")
	t.Setenv("RADAS_PROJECT_ID", "env-project")

	root := newRuntimeRootCmd(t)

	// Environment beats the built-in default.
	rc, err := LoadRuntimeConfig(root)
	if err != nil {
		t.Fatalf("LoadRuntimeConfig: %v", err)
	}
	if rc.APIURL != "http://env-url:5001" {
		t.Errorf("APIURL = %q, want env value", rc.APIURL)
	}
	if rc.Token != "env-token" {
		t.Errorf("Token = %q, want env value", rc.Token)
	}
	if rc.OrganizationID != "env-org" {
		t.Errorf("OrganizationID = %q, want env value", rc.OrganizationID)
	}
	if rc.ProjectID != "env-project" {
		t.Errorf("ProjectID = %q, want env value", rc.ProjectID)
	}

	// Explicit flags beat the environment.
	flags := map[string]string{
		FlagAPIURL:    "http://flag-url:5001",
		FlagToken:     "flag-token",
		FlagOrgID:     "flag-org",
		FlagProjectID: "flag-project",
	}
	for name, value := range flags {
		if err := root.PersistentFlags().Set(name, value); err != nil {
			t.Fatalf("set flag %s: %v", name, err)
		}
	}
	rc, err = LoadRuntimeConfig(root)
	if err != nil {
		t.Fatalf("LoadRuntimeConfig: %v", err)
	}
	if rc.APIURL != "http://flag-url:5001" {
		t.Errorf("APIURL = %q, want flag value", rc.APIURL)
	}
	if rc.Token != "flag-token" {
		t.Errorf("Token = %q, want flag value", rc.Token)
	}
	if rc.OrganizationID != "flag-org" {
		t.Errorf("OrganizationID = %q, want flag value", rc.OrganizationID)
	}
	if rc.ProjectID != "flag-project" {
		t.Errorf("ProjectID = %q, want flag value", rc.ProjectID)
	}
}

func TestLoadRuntimeConfigSelectorFallback(t *testing.T) {
	isolateEnv(t)

	if err := SaveSelector(Selector{OrganizationID: "sel-org", ProjectID: "sel-project"}); err != nil {
		t.Fatalf("SaveSelector: %v", err)
	}

	root := newRuntimeRootCmd(t)

	// Persisted selector is used when neither flag nor env provides a value.
	rc, err := LoadRuntimeConfig(root)
	if err != nil {
		t.Fatalf("LoadRuntimeConfig: %v", err)
	}
	if rc.OrganizationID != "sel-org" {
		t.Errorf("OrganizationID = %q, want selector value", rc.OrganizationID)
	}
	if rc.ProjectID != "sel-project" {
		t.Errorf("ProjectID = %q, want selector value", rc.ProjectID)
	}

	// Environment overrides the selector.
	t.Setenv("RADAS_PROJECT_ID", "env-project")
	rc, err = LoadRuntimeConfig(root)
	if err != nil {
		t.Fatalf("LoadRuntimeConfig: %v", err)
	}
	if rc.ProjectID != "env-project" {
		t.Errorf("ProjectID = %q, want env value over selector", rc.ProjectID)
	}
	if rc.OrganizationID != "sel-org" {
		t.Errorf("OrganizationID = %q, want selector value", rc.OrganizationID)
	}

	// Flag overrides both.
	if err := root.PersistentFlags().Set(FlagProjectID, "flag-project"); err != nil {
		t.Fatalf("set flag: %v", err)
	}
	rc, err = LoadRuntimeConfig(root)
	if err != nil {
		t.Fatalf("LoadRuntimeConfig: %v", err)
	}
	if rc.ProjectID != "flag-project" {
		t.Errorf("ProjectID = %q, want flag value", rc.ProjectID)
	}
}

func TestSelectorFileStoresIDsOnly(t *testing.T) {
	dir := isolateEnv(t)
	t.Setenv("RADAS_TOKEN", "super-secret-token-value")

	if err := SaveSelector(Selector{OrganizationID: "org-1", ProjectID: "proj-1"}); err != nil {
		t.Fatalf("SaveSelector: %v", err)
	}

	path := filepath.Join(dir, SelectorFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read selector file: %v", err)
	}
	if strings.Contains(string(data), "super-secret-token-value") {
		t.Fatal("token value leaked into selector file")
	}

	var sel Selector
	if err := json.Unmarshal(data, &sel); err != nil {
		t.Fatalf("selector file is not valid JSON: %v", err)
	}
	if sel.ProjectID != "proj-1" || sel.OrganizationID != "org-1" {
		t.Errorf("selector round-trip mismatch: %+v", sel)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat selector file: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("selector file mode = %v, want 0600", info.Mode().Perm())
	}
}

func TestLoadSelectorMissingFile(t *testing.T) {
	isolateEnv(t)

	sel, err := LoadSelector()
	if err != nil {
		t.Fatalf("LoadSelector on missing file: %v", err)
	}
	if sel.ProjectID != "" || sel.OrganizationID != "" {
		t.Errorf("selector = %+v, want empty", sel)
	}
}

func TestLoadRuntimeConfigCorruptSelectorFails(t *testing.T) {
	dir := isolateEnv(t)
	if err := os.WriteFile(filepath.Join(dir, SelectorFileName), []byte("{not json"), 0o600); err != nil {
		t.Fatalf("write corrupt selector: %v", err)
	}

	root := newRuntimeRootCmd(t)
	if _, err := LoadRuntimeConfig(root); err == nil {
		t.Fatal("expected error for corrupt selector file, got nil")
	}
}

func TestLoadRuntimeConfigNilCommand(t *testing.T) {
	if _, err := LoadRuntimeConfig(nil); err == nil {
		t.Fatal("expected error for nil command, got nil")
	}
}
