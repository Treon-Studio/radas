package integration

// End-to-end CLI journey (Task 7.2 of the 2026-08-27 console/CLI integration
// plan). Companion: docs/architecture/e2e-flow-matrix.md.
//
// One sequential user journey through the production client stack, exactly
// the commands `radas` ships (internal/client + cmd/auth credential store):
//
//	J1 login -> org-scoped project list -> project selection
//	J2 idempotent service deploy mutation -> replay keeps the operation id
//	J3 the CLI reads the same contracts the console reads (platform envelope,
//	   request-ID pairing)
//
// Env-gated exactly like cross_client_test.go (the same RADAS_TEST_*
// variables; run through scripts/run-cli-server-contract-test.sh or
// scripts/run-cross-client-contracts.sh mode b). Without a live server the
// test skips cleanly. Failure messages carry journey=/client=/domain= labels;
// tokens are never printed or embedded in assertion messages.

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/spf13/cobra"

	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/client"
)

func TestE2EFlowJourney(t *testing.T) {
	baseURL, username, password, projectName, slug, version := contractEnv(t)
	fixtures := loadCrossClientFixtures(t)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := &cobra.Command{}

	// --- journey=J1 domain=auth: login through the production client --------
	label := "journey=J1 client=go domain=auth endpoint=POST /api/auth/login"
	loginClient := client.New(client.Config{BaseURL: baseURL, Timeout: 15 * time.Second})
	rid := client.NewRequestID()
	resp, err := loginClient.Do(ctx, http.MethodPost, "/api/auth/login",
		map[string]string{"username": username, "password": password},
		client.RequestOptions{RequestID: rid, IdempotencyKey: rid})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	if resp.StatusCode != loginStatusWant(fixtures) {
		t.Fatalf("%s: got status %d, want %d", label, resp.StatusCode, loginStatusWant(fixtures))
	}
	var login loginEnvelope
	decodeInto(t, resp, &login)
	if !login.Success || login.AccessToken == "" {
		t.Fatalf("%s: no usable access token returned", label)
	}
	// Persist the session the way the CLI does so later steps ride the real
	// credential store, including auto-refresh on 401.
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())
	t.Setenv("RADAS_API_URL", baseURL)
	t.Setenv("RADAS_TOKEN", "")
	store := cliauth.NewStore()
	if err := store.Save(cliauth.Credentials{
		APIURL:       baseURL,
		AccessToken:  login.AccessToken,
		RefreshToken: login.RefreshToken,
		Username:     login.User.Username,
		SavedAt:      time.Now().UTC(),
	}); err != nil {
		t.Fatalf("%s: store credentials: %v", label, err)
	}

	// --- journey=J1 domain=projects: org-scoped list + selection ------------
	label = "journey=J1 client=go domain=projects endpoint=GET /api/projects"
	resp, err = call(ctx, cmd, http.MethodGet, "/api/projects", nil, client.RequestOptions{})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("%s: got status %d, want 200", label, resp.StatusCode)
	}
	var list struct {
		Success  bool          `json:"success"`
		Projects []projectInfo `json:"projects"`
	}
	decodeInto(t, resp, &list)
	if !list.Success {
		t.Fatalf("%s: envelope reports success=false", label)
	}
	projectID := ""
	for i := range list.Projects {
		if list.Projects[i].Name == projectName {
			projectID = list.Projects[i].ID
			break
		}
	}
	if projectID == "" {
		t.Fatalf("%s: project %q not found in the org-scoped list (seed it on the server first)", label, projectName)
	}

	// --- journey=J3 domain=services: platform envelope read -----------------
	label = "journey=J3 client=go domain=services endpoint=GET /api/projects/<pid>/services"
	servicesPath := "/api/projects/" + projectID + "/services"
	resp, err = call(ctx, cmd, http.MethodGet, servicesPath, nil, client.RequestOptions{})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("%s: got status %d, want 200", label, resp.StatusCode)
	}
	if requestIDOf(resp.Body) == "" || requestIDOf(resp.Body) != resp.Header.Get("X-Request-Id") {
		t.Fatalf("%s: body request_id must equal the X-Request-Id response header", label)
	}

	// --- journey=J2 domain=services: idempotent deploy + replay -------------
	if slug == "" {
		t.Skip("journey=J2: RADAS_TEST_CATALOG_SLUG unset — mutation legs skipped (read-only journey)")
	}
	label = "journey=J2 client=go domain=services endpoint=POST /api/projects/<pid>/services"
	key := client.NewRequestID()
	payload := map[string]any{
		"name": "e2e-journey-svc", "environment": "development", "catalog_slug": slug,
		"catalog_version": version, "runtime_id": "mock",
		"spec": map[string]any{"mode": "safe"}, "deploy": true,
	}

	first, err := call(ctx, cmd, http.MethodPost, servicesPath, payload, client.RequestOptions{IdempotencyKey: key})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	if first.StatusCode != http.StatusAccepted {
		t.Fatalf("%s: got status %d, want 202", label, first.StatusCode)
	}
	var created struct {
		Operation struct {
			ID string `json:"id"`
		} `json:"operation"`
	}
	decodeInto(t, first, &created)

	replayed, err := call(ctx, cmd, http.MethodPost, servicesPath, payload, client.RequestOptions{IdempotencyKey: key})
	if err != nil {
		t.Fatalf("%s: replay: %v", label, err)
	}
	if replayed.StatusCode != http.StatusAccepted {
		t.Fatalf("%s: replay got status %d, want 202", label, replayed.StatusCode)
	}
	var replay struct {
		Operation struct {
			ID string `json:"id"`
		} `json:"operation"`
	}
	decodeInto(t, replayed, &replay)
	if created.Operation.ID == "" || created.Operation.ID != replay.Operation.ID {
		t.Fatalf("%s: the replay must return the same operation id (%q -> %q)",
			label, created.Operation.ID, replay.Operation.ID)
	}
}
