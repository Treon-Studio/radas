// Package integration holds cross-component contract tests that need a live
// RADAS control plane. The tests here are env-gated: without the RADAS_TEST_*
// environment variables they skip cleanly, so `go test ./...` stays green in
// CI and on every checkout without a running server (Task 3.4 of the
// 2026-08-27 plan).
//
// Server-side reference half: apps/server/tests/test_cli_server_integration.py
// proves the same contract against the real Flask blueprints and PostgreSQL.
//
// Contract exercised (one read + one idempotent mutation through the real CLI
// request stack):
//
//	POST /api/auth/login                          -> 200 {success, access_token, refresh_token, ...}
//	GET  /api/projects                            -> 200 {success, projects: [...]} (org-scoped)
//	GET  /api/projects/<pid>/services             -> 200 {data: {services}, request_id} + X-Request-ID
//	POST /api/projects/<pid>/services             -> 202 {operation, request_id} + X-Request-ID
//	  (deploy=true + Idempotency-Key; replay with the same key and body returns
//	   the same operation id; the same key with a different payload is a 409 —
//	   error code CONFLICT when the server's idempotency cache answers,
//	   SERVICE_OPERATION_CONFLICT when the DB-level layer answers)
//
// Configuration (all required variables must be set or the test skips):
//
//	RADAS_TEST_API_URL        base URL of the running server (e.g. http://127.0.0.1:5001)
//	RADAS_TEST_USERNAME       login username
//	RADAS_TEST_PASSWORD       login password
//	RADAS_TEST_PROJECT_NAME   project (name) to select from GET /api/projects
//	RADAS_TEST_CATALOG_SLUG   optional: catalog definition slug for the mutation;
//	                          when unset only read assertions run
//	RADAS_TEST_CATALOG_VERSION optional: defaults to 1.0.0
//
// When RADAS_TEST_CATALOG_SLUG is set the queued deploy stays queued unless a
// worker claims it; point the slug at a harmless, non-production definition
// (e.g. the mock exec-demo definition used by the server's own tests). No
// cloud credentials are required anywhere in this test.
//
// Tokens are stored in a temp RADAS_CONFIG_DIR and are never printed, logged,
// or embedded in failure messages.
package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	cmdauth "github.com/raizora/radas/v4/cmd/auth"
	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// loginResponse mirrors cmd/auth's login decoding: exactly the fields the CLI
// consumes from POST /api/auth/login.
type loginResponse struct {
	Success      bool   `json:"success"`
	MFARequired  bool   `json:"mfa_required"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ActiveOrgID  string `json:"active_org_id"`
	User         struct {
		Username string `json:"username"`
	} `json:"user"`
}

// errorEnvelope mirrors the server's platform error contract.
type errorEnvelope struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	RequestID string `json:"request_id"`
}

type projectInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	OrgID      string `json:"orgId,omitempty"`
	IsArchived bool   `json:"isArchived,omitempty"`
}

// contractEnv resolves the env gate. Skipping is the default state so CI
// without a live server never fails.
func contractEnv(t *testing.T) (baseURL, username, password, projectName, slug, version string) {
	t.Helper()
	baseURL = os.Getenv("RADAS_TEST_API_URL")
	username = os.Getenv("RADAS_TEST_USERNAME")
	password = os.Getenv("RADAS_TEST_PASSWORD")
	projectName = os.Getenv("RADAS_TEST_PROJECT_NAME")
	if baseURL == "" || username == "" || password == "" || projectName == "" {
		t.Skip("server contract test needs a live server: set RADAS_TEST_API_URL, RADAS_TEST_USERNAME, " +
			"RADAS_TEST_PASSWORD, RADAS_TEST_PROJECT_NAME (see scripts/run-cli-server-contract-test.sh)")
	}
	slug = os.Getenv("RADAS_TEST_CATALOG_SLUG")
	version = os.Getenv("RADAS_TEST_CATALOG_VERSION")
	if version == "" {
		version = "1.0.0"
	}
	return baseURL, username, password, projectName, slug, version
}

// call performs one authenticated control-plane call through the production
// credential path (cmd/auth.DoWithRefresh): stored credentials, one auto
// refresh on a 401, typed errors.
func call(ctx context.Context, cmd *cobra.Command, method, path string, body any, opts client.RequestOptions) (*client.Response, error) {
	return cmdauth.DoWithRefresh(ctx, cmd, func(c *client.Client) (*client.Response, error) {
		return c.Do(ctx, method, path, body, opts)
	})
}

func decodeInto(t *testing.T, resp *client.Response, v any) {
	t.Helper()
	if err := json.Unmarshal(resp.Body, v); err != nil {
		t.Fatalf("decode response envelope: %v", err)
	}
}

func TestServerContractFlow(t *testing.T) {
	baseURL, username, password, projectName, slug, version := contractEnv(t)

	// Isolate every piece of CLI local state: credentials go to a temp
	// RADAS_CONFIG_DIR (never the developer's real store), and a stray
	// RADAS_TOKEN override is neutralized so the stored-credential path is
	// actually exercised.
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())
	t.Setenv("RADAS_API_URL", baseURL)
	t.Setenv("RADAS_TOKEN", "")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := &cobra.Command{}

	// --- login (same request as `radas auth login`) -------------------------
	loginClient := client.New(client.Config{BaseURL: baseURL, Timeout: 15 * time.Second})
	rid := client.NewRequestID()
	resp, err := loginClient.Do(ctx, http.MethodPost, "/api/auth/login",
		map[string]string{"username": username, "password": password},
		client.RequestOptions{RequestID: rid, IdempotencyKey: rid})
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login: got status %d, want 200", resp.StatusCode)
	}
	var login loginResponse
	decodeInto(t, resp, &login)
	if login.MFARequired {
		t.Fatal("login: test account requires MFA; use a non-MFA account for the contract test")
	}
	if !login.Success || login.AccessToken == "" || login.RefreshToken == "" {
		t.Fatal("login: server returned no usable tokens")
	}

	// Persist the credentials exactly like `radas auth login` does so the
	// remaining calls go through the real auto-refresh path.
	store := cliauth.NewStore()
	if err := store.Save(cliauth.Credentials{
		APIURL:       baseURL,
		AccessToken:  login.AccessToken,
		RefreshToken: login.RefreshToken,
		Username:     login.User.Username,
		SavedAt:      time.Now().UTC(),
	}); err != nil {
		t.Fatalf("store credentials: %v", err)
	}

	// --- read: project list, pick the configured project ---------------------
	resp, err = call(ctx, cmd, http.MethodGet, "/api/projects", nil, client.RequestOptions{})
	if err != nil {
		t.Fatalf("GET /api/projects failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/projects: got status %d, want 200", resp.StatusCode)
	}
	var list struct {
		Success  bool          `json:"success"`
		Projects []projectInfo `json:"projects"`
	}
	decodeInto(t, resp, &list)
	if !list.Success {
		t.Fatal("GET /api/projects: envelope reports success=false")
	}
	var project *projectInfo
	for i := range list.Projects {
		if list.Projects[i].Name == projectName {
			project = &list.Projects[i]
			break
		}
	}
	if project == nil {
		t.Fatalf("GET /api/projects: project %q not found in the org-scoped list (seed it on the server first)", projectName)
	}

	// --- read on the platform namespace: envelope + X-Request-ID -------------
	resp, err = call(ctx, cmd, http.MethodGet,
		fmt.Sprintf("/api/projects/%s/services", project.ID), nil, client.RequestOptions{})
	if err != nil {
		t.Fatalf("GET services list failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET services list: got status %d, want 200", resp.StatusCode)
	}
	if resp.Header.Get("X-Request-Id") == "" {
		t.Fatal("GET services list: response is missing the X-Request-Id header")
	}
	var servicesEnvelope struct {
		Data struct {
			Services []map[string]any `json:"services"`
		} `json:"data"`
		RequestID string `json:"request_id"`
	}
	decodeInto(t, resp, &servicesEnvelope)
	if servicesEnvelope.RequestID == "" || servicesEnvelope.RequestID != resp.Header.Get("X-Request-Id") {
		t.Fatal("GET services list: request_id in the body must match the X-Request-Id header")
	}

	// --- mutation: idempotent service create ---------------------------------
	// Skipped unless the operator seeded a catalog definition (env-gated per
	// the plan: "fall back to any GET-only assertion if unset"). The name and
	// idempotency key are unique per run, so repeated runs never collide with
	// previous instances on a persistent server.
	if slug == "" {
		t.Log("RADAS_TEST_CATALOG_SLUG unset: read-only contract assertions only")
		return
	}

	name := fmt.Sprintf("cli-contract-%d", time.Now().UnixNano())
	payload := map[string]any{
		"name":            name,
		"environment":     "development",
		"catalog_slug":    slug,
		"catalog_version": version,
		"runtime_id":      "mock",
		"spec":            map[string]any{"mode": "safe"},
		"deploy":          true,
	}
	mutatePath := fmt.Sprintf("/api/projects/%s/services", project.ID)
	opts := client.RequestOptions{
		RequestID:      client.NewRequestID(),
		IdempotencyKey: client.NewRequestID(),
		ProjectID:      project.ID,
		OrganizationID: login.ActiveOrgID,
	}

	resp, err = call(ctx, cmd, http.MethodPost, mutatePath, payload, opts)
	if err != nil {
		t.Fatalf("POST service create failed: %v", err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST service create: got status %d, want 202", resp.StatusCode)
	}
	if resp.Header.Get("X-Request-Id") == "" {
		t.Fatal("POST service create: response is missing the X-Request-Id header")
	}
	var created struct {
		Operation struct {
			ID         string `json:"id"`
			Kind       string `json:"kind"`
			Status     string `json:"status"`
			InstanceID string `json:"instance_id"`
		} `json:"operation"`
		RequestID string `json:"request_id"`
	}
	decodeInto(t, resp, &created)
	if created.Operation.ID == "" || created.Operation.InstanceID == "" {
		t.Fatal("POST service create: envelope is missing operation id/instance_id")
	}
	if created.Operation.Kind != "service.deploy" {
		t.Fatalf("POST service create: operation kind %q, want service.deploy", created.Operation.Kind)
	}
	if created.RequestID == "" || created.RequestID != resp.Header.Get("X-Request-Id") {
		t.Fatal("POST service create: request_id in the body must match the X-Request-Id header")
	}

	// Replay: same key + identical body must return the SAME operation id —
	// under both idempotency layers (app-level cached envelope or the
	// DB-level operation replay).
	resp, err = call(ctx, cmd, http.MethodPost, mutatePath, payload, opts)
	if err != nil {
		t.Fatalf("POST service create replay failed: %v", err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST service create replay: got status %d, want 202", resp.StatusCode)
	}
	var replay struct {
		Operation struct {
			ID         string `json:"id"`
			InstanceID string `json:"instance_id"`
		} `json:"operation"`
	}
	decodeInto(t, resp, &replay)
	if replay.Operation.ID != created.Operation.ID || replay.Operation.InstanceID != created.Operation.InstanceID {
		t.Fatalf("POST service create replay: operation id changed (%s -> %s): idempotency replay is broken",
			created.Operation.ID, replay.Operation.ID)
	}

	// Key reuse with a different payload must conflict. The error code depends
	// on which layer answers (CONFLICT = app-level cache,
	// SERVICE_OPERATION_CONFLICT = DB-level); both are 409 contract codes.
	other := map[string]any{
		"name": name + "-other", "environment": "development",
		"catalog_slug": slug, "catalog_version": version,
		"runtime_id": "mock", "spec": map[string]any{"mode": "fast"}, "deploy": true,
	}
	resp, err = call(ctx, cmd, http.MethodPost, mutatePath, other, opts)
	if err == nil {
		t.Fatalf("POST service create with reused key and different payload: got status %d, want 409", resp.StatusCode)
	}
	var httpErr *client.HTTPError
	if !errors.As(err, &httpErr) || httpErr.StatusCode != http.StatusConflict {
		t.Fatalf("POST service create with reused key and different payload: unexpected error %v", err)
	}
	var conflict errorEnvelope
	_ = json.Unmarshal([]byte(httpErr.Body), &conflict)
	if code := conflict.Error.Code; code != "CONFLICT" && code != "SERVICE_OPERATION_CONFLICT" {
		t.Fatalf("POST service create key reuse: error code %q, want CONFLICT or SERVICE_OPERATION_CONFLICT", code)
	}
}
