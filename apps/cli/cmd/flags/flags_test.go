package flags

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/spf13/cobra"

	"github.com/raizora/radas/v4/internal/config"
)

func TestFlagsCommands(t *testing.T) {
	buf := new(bytes.Buffer)
	Cmd.SetOut(buf)

	// 1. List
	Cmd.SetArgs([]string{"list"})
	err := Cmd.Execute()
	if err != nil {
		t.Fatalf("flags list failed: %v", err)
	}

	// 2. Get
	Cmd.SetArgs([]string{"get", "dark-mode-v2"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("flags get failed: %v", err)
	}

	// 3. Set
	Cmd.SetArgs([]string{"set", "dark-mode-v2", "true"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("flags set failed: %v", err)
	}

	// 4. Kill
	Cmd.SetArgs([]string{"kill", "dark-mode-v2"})
	err = Cmd.Execute()
	if err != nil {
		t.Fatalf("flags kill failed: %v", err)
	}
}

// TestFlagsListUsesCentralRuntimeConfig proves the flags command factory no
// longer resolves RADAS_API_URL/RADAS_TOKEN on its own: the request must be
// driven end to end by the shared LoadRuntimeConfig path, including the
// --api-url/--token/--project-id flags and their environment fallbacks.
func TestFlagsListUsesCentralRuntimeConfig(t *testing.T) {
	var (
		gotPath      string
		gotAuth      string
		gotProjectID string
		gotRequestID string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotProjectID = r.Header.Get("X-Project-Id")
		gotRequestID = r.Header.Get("X-Request-Id")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"flags": []map[string]any{{
				"key":             "central-config-flag",
				"name":            "Central Config Flag",
				"enabled":         true,
				"rollout_percent": 42,
				"kill_switch":     false,
				"scope_type":      "project",
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
		"--token", "test-token-123",
		"--project-id", "proj-central",
		"flags", "list",
	})

	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)

	if err := root.Execute(); err != nil {
		t.Fatalf("flags list: %v", err)
	}

	if gotPath != "/api/flags" {
		t.Errorf("request path = %q, want /api/flags (factory ignored --api-url?)", gotPath)
	}
	if gotAuth != "Bearer test-token-123" {
		t.Errorf("Authorization header = %q, want bearer token from --token flag", gotAuth)
	}
	if gotProjectID != "proj-central" {
		t.Errorf("X-Project-Id header = %q, want value from --project-id flag", gotProjectID)
	}
	if gotRequestID == "" {
		t.Error("X-Request-Id header missing; shared client must correlate requests")
	}
}
