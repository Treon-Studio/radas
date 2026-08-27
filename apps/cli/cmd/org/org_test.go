package org

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
)

func TestOrgCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org list failed: %v", err)
	}

	// 2. Switch
	Cmd.SetArgs([]string{"switch", "org-sandbox"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org switch failed: %v", err)
	}

	// 3. Rules
	Cmd.SetArgs([]string{"rules", "org-global"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org rules failed: %v", err)
	}

	// 4. Set Rules
	Cmd.SetArgs([]string{"rules", "set-rules", "org-global", "--require-tags", "env,team", "--deny-ports", "22", "--enforce"})
	if err := Cmd.Execute(); err != nil {
		t.Fatalf("org set-rules failed: %v", err)
	}
}

// TestOrgListUsesCentralRuntimeConfig proves the org command factory no
// longer resolves RADAS_API_URL/RADAS_TOKEN on its own: the request must be
// driven end to end by the shared LoadRuntimeConfig path, including the
// --api-url/--token/--org-id flags and their environment fallbacks.
func TestOrgListUsesCentralRuntimeConfig(t *testing.T) {
	var (
		gotPath string
		gotAuth string
		gotOrg  string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotOrg = r.Header.Get("X-Org-Id")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"orgs": []map[string]any{{
				"id":         "org-1",
				"slug":       "primary-org",
				"name":       "Primary Org",
				"role":       "admin",
				"is_current": true,
			}},
		})
	}))
	defer srv.Close()

	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())
	t.Setenv("RADAS_API_URL", "")
	t.Setenv("RADAS_TOKEN", "")

	root := &cobra.Command{Use: "radas"}
	config.RegisterPersistentFlags(root)
	root.AddCommand(Cmd)
	root.SetArgs([]string{
		"--api-url", srv.URL,
		"--token", "test-token-org",
		"--org-id", "org-flag",
		"org", "list",
	})

	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)

	if err := root.Execute(); err != nil {
		t.Fatalf("org list: %v", err)
	}

	if gotPath != "/api/orgs" {
		t.Errorf("request path = %q, want /api/orgs (factory ignored --api-url?)", gotPath)
	}
	if gotAuth != "Bearer test-token-org" {
		t.Errorf("Authorization header = %q, want bearer token from --token flag", gotAuth)
	}
	if gotOrg != "org-flag" {
		t.Errorf("X-Org-Id header = %q, want value from --org-id flag", gotOrg)
	}
}
