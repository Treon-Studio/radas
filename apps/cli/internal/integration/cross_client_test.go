/*
Cross-client contract parity (Task 6.2 of the 2026-08-27 console/CLI
integration plan).

The same "login → projects read → services read → idempotent deploy mutation →
replay/conflict" flow is exercised by TWO client legs and asserted equivalent:

 1. client=direct-http — raw net/http requests, pinning the wire contract.
 2. client=go          — the production Go request stack (internal/client +
    cmd/auth auto-refresh), exactly what `radas` ships.

The TypeScript console leg lives in
apps/console/src/test/cross-client-fixtures.test.ts. Every leg pins the
contract recorded in contracts/cross-client-fixtures.json, populated from the
server reference half apps/server/tests/test_cli_server_integration.py.

Parity is asserted on: per-step status, project scope (org-scoped project list,
orgId consistent with the login org context), request-ID pairing (body
request_id == X-Request-ID header on the platform namespace), idempotency
replay result (same key + identical body → same operation id/instance_id), and
structured error codes (409 key-reuse conflict, 400 missing-key validation,
401 unauthorized scope). Conflict codes may come from either idempotency layer
(CONFLICT via the app-level cache, SERVICE_OPERATION_CONFLICT via the DB
layer), so both legs only assert membership in the contract's allowed set.

Env-gated exactly like server_contract_test.go: without the RADAS_TEST_*
variables the test skips cleanly, so `go test ./...` stays green everywhere.
The fixture file is compared against both legs whenever it can be located;
a missing fixture file degrades to the built-in defaults instead of failing.

Every failure message carries client=/domain=/endpoint= labels. Tokens are
never printed, logged, or embedded in failure messages.
*/
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	cliauth "github.com/raizora/radas/v4/internal/auth"
	"github.com/raizora/radas/v4/internal/client"
	"github.com/spf13/cobra"
)

// defaultConflictCodes mirrors contracts/cross-client-fixtures.json
// (idempotency_conflict.error_codes) for runs where the fixture file cannot
// be located.
var defaultConflictCodes = []string{"CONFLICT", "SERVICE_OPERATION_CONFLICT"}

type contractFixtures struct {
	ContractVersion int `json:"contract_version"`
	Steps           struct {
		Login struct {
			Response struct {
				Status   int      `json:"status"`
				BodyKeys []string `json:"body_keys"`
			} `json:"response"`
		} `json:"login"`
		ProjectsList struct {
			Response struct {
				Status   int      `json:"status"`
				BodyKeys []string `json:"body_keys"`
			} `json:"response"`
		} `json:"projects_list"`
		ServicesList struct {
			Response struct {
				Status   int      `json:"status"`
				BodyKeys []string `json:"body_keys"`
			} `json:"response"`
		} `json:"services_list"`
		ServiceDeploy struct {
			Response struct {
				Status          int      `json:"status"`
				BodyKeys        []string `json:"body_keys"`
				OperationKeys   []string `json:"operation_keys"`
				OperationValues struct {
					Kind   string `json:"kind"`
					Status string `json:"status"`
				} `json:"operation_values"`
			} `json:"response"`
		} `json:"service_deploy"`
		IdempotencyReplay struct {
			Response struct {
				Status int `json:"status"`
			} `json:"response"`
		} `json:"idempotency_replay"`
		IdempotencyConflict struct {
			Response struct {
				Status     int      `json:"status"`
				ErrorCodes []string `json:"error_codes"`
			} `json:"response"`
		} `json:"idempotency_conflict"`
		MissingIdempotencyKey struct {
			Response struct {
				Status     int      `json:"status"`
				ErrorCodes []string `json:"error_codes"`
			} `json:"response"`
		} `json:"missing_idempotency_key"`
		ScopeErrors struct {
			Cases []struct {
				Response struct {
					Status     int      `json:"status"`
					ErrorCodes []string `json:"error_codes"`
				} `json:"response"`
			} `json:"cases"`
		} `json:"scope_errors"`
	} `json:"steps"`
}

// loadCrossClientFixtures locates contracts/cross-client-fixtures.json from
// the repo root relative to this package. It returns nil (the caller then
// degrades to the built-in defaults) when the file cannot be found, so the
// live-server contract never hard-depends on checkout layout.
func loadCrossClientFixtures(t *testing.T) *contractFixtures {
	t.Helper()
	for _, candidate := range []string{
		"../../../../contracts/cross-client-fixtures.json", // go test cwd = this package dir
		"../../../contracts/cross-client-fixtures.json",    // alternative checkouts
	} {
		raw, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		var fixtures contractFixtures
		if err := json.Unmarshal(raw, &fixtures); err != nil {
			t.Fatalf("domain=contract: parse %s: %v", candidate, err)
		}
		return &fixtures
	}
	t.Log("domain=contract: contracts/cross-client-fixtures.json not found; " +
		"asserting the built-in contract defaults only")
	return nil
}

// loginEnvelope is the full login body this test consumes (org context
// included, so project-scope parity can be checked against active_org_id).
type loginEnvelope struct {
	Success      bool   `json:"success"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ActiveOrgID  string `json:"active_org_id"`
	Orgs         []struct {
		ID string `json:"id"`
	} `json:"orgs"`
	User struct {
		Username string `json:"username"`
	} `json:"user"`
}

type operationView struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Status     string `json:"status"`
	InstanceID string `json:"instance_id"`
}

type operationEnvelope struct {
	Operation operationView `json:"operation"`
	Data      struct {
		Operation operationView `json:"operation"`
	} `json:"data"`
	RequestID string `json:"request_id"`
}

// parityOutcome captures the observable contract surface of one client leg so
// the two legs can be asserted equivalent field by field.
type parityOutcome struct {
	LoginStatus        int
	ProjectsStatus     int
	ProjectFound       bool // configured project present in the org-scoped list
	OrgScopeConsistent bool // project orgId consistent with the login org context
	ServicesStatus     int
	ServicesRIDPaired  bool // body request_id == X-Request-ID header
	DeployStatus       int
	DeployRIDPaired    bool
	DeployKind         string
	DeployOpStatus     string
	ReplayStatus       int
	ReplaySameOp       bool
	ConflictStatus     int
	ConflictCode       string
	MissingKeyStatus   int
	MissingKeyCode     string
	ScopeStatus        int
	ScopeCode          string
	SkippedMutation    bool // RADAS_TEST_CATALOG_SLUG unset → read-only legs
}

// directLeg performs raw HTTP calls labeled client=direct-http.
type directLeg struct {
	base string
	hc   *http.Client
}

func (d directLeg) do(t *testing.T, endpoint, method, path string, headers map[string]string, body any) (int, http.Header, []byte) {
	t.Helper()
	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("client=direct-http endpoint=%s: marshal body: %v", endpoint, err)
		}
		payload = encoded
	}
	req, err := http.NewRequest(method, d.base+path, bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("client=direct-http endpoint=%s: build request: %v", endpoint, err)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	if body != nil && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := d.hc.Do(req)
	if err != nil {
		t.Fatalf("client=direct-http endpoint=%s: request failed: %v", endpoint, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("client=direct-http endpoint=%s: read response: %v", endpoint, err)
	}
	return resp.StatusCode, resp.Header, raw
}

// requireEnvelopeKeys asserts the response body carries the fixture's keys.
func requireEnvelopeKeys(t *testing.T, label string, raw []byte, keys []string) {
	t.Helper()
	if len(keys) == 0 {
		return
	}
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("%s: decode JSON envelope: %v", label, err)
	}
	for _, key := range keys {
		if _, ok := envelope[key]; !ok {
			t.Fatalf("%s: response envelope is missing contract key %q", label, key)
		}
	}
}

func requireCodeIn(t *testing.T, label string, raw []byte, allowed []string) string {
	t.Helper()
	var envelope errorEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("%s: decode error envelope: %v", label, err)
	}
	for _, code := range allowed {
		if envelope.Error.Code == code {
			return envelope.Error.Code
		}
	}
	t.Fatalf("%s: error code %q, want one of %v", label, envelope.Error.Code, allowed)
	return ""
}

// requestIDOf extracts body.request_id without failing on absent fields.
func requestIDOf(raw []byte) string {
	var envelope struct {
		RequestID string `json:"request_id"`
	}
	if json.Unmarshal(raw, &envelope) != nil {
		return ""
	}
	return envelope.RequestID
}

func loginFixtureKeys(fixtures *contractFixtures) []string {
	if fixtures == nil {
		return nil
	}
	return fixtures.Steps.Login.Response.BodyKeys
}

// Per-step fixture statuses; each falls back to the built-in contract default
// when the fixture file is unavailable.
func loginStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.Login.Response.Status
	}
	return 200
}

func projectsStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.ProjectsList.Response.Status
	}
	return 200
}

func servicesStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.ServicesList.Response.Status
	}
	return 200
}

func deployStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.ServiceDeploy.Response.Status
	}
	return 202
}

func replayStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.IdempotencyReplay.Response.Status
	}
	return 202
}

func conflictStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.IdempotencyConflict.Response.Status
	}
	return 409
}

func missingKeyStatusWant(fx *contractFixtures) int {
	if fx != nil {
		return fx.Steps.MissingIdempotencyKey.Response.Status
	}
	return 400
}

func scopeCaseStatus(fixtures *contractFixtures, fallback int) int {
	if fixtures != nil && len(fixtures.Steps.ScopeErrors.Cases) > 0 {
		return fixtures.Steps.ScopeErrors.Cases[0].Response.Status
	}
	return fallback
}

func conflictCodesFor(fixtures *contractFixtures) []string {
	if fixtures != nil && len(fixtures.Steps.IdempotencyConflict.Response.ErrorCodes) > 0 {
		return fixtures.Steps.IdempotencyConflict.Response.ErrorCodes
	}
	return defaultConflictCodes
}

func missingKeyCodesFor(fixtures *contractFixtures) []string {
	if fixtures != nil && len(fixtures.Steps.MissingIdempotencyKey.Response.ErrorCodes) > 0 {
		return fixtures.Steps.MissingIdempotencyKey.Response.ErrorCodes
	}
	return []string{"SERVICE_VALIDATION_FAILED"}
}

func scopeCodesFor(fixtures *contractFixtures) []string {
	if fixtures != nil && len(fixtures.Steps.ScopeErrors.Cases) > 0 {
		return fixtures.Steps.ScopeErrors.Cases[0].Response.ErrorCodes
	}
	return []string{"UNAUTHORIZED"}
}

// runDirectHTTPLeg exercises the whole flow with raw net/http.
func runDirectHTTPLeg(t *testing.T, baseURL, username, password, projectName, slug, version string, fixtures *contractFixtures) parityOutcome {
	t.Helper()
	out := parityOutcome{SkippedMutation: slug == ""}
	leg := directLeg{base: baseURL, hc: &http.Client{Timeout: 20 * time.Second}}

	// --- domain=auth: login -------------------------------------------------
	label := "client=direct-http domain=auth endpoint=POST /api/auth/login"
	status, _, raw := leg.do(t, label, http.MethodPost, "/api/auth/login", nil,
		map[string]string{"username": username, "password": password})
	out.LoginStatus = status
	want := loginStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}
	requireEnvelopeKeys(t, label, raw, loginFixtureKeys(fixtures))
	var login loginEnvelope
	if err := json.Unmarshal(raw, &login); err != nil {
		t.Fatalf("%s: decode login envelope: %v", label, err)
	}
	if !login.Success || login.AccessToken == "" || login.RefreshToken == "" {
		t.Fatalf("%s: server returned no usable tokens", label)
	}
	auth := map[string]string{"Authorization": "Bearer " + login.AccessToken}
	var header http.Header

	// --- domain=projects: org-scoped project list ---------------------------
	label = "client=direct-http domain=projects endpoint=GET /api/projects"
	status, _, raw = leg.do(t, label, http.MethodGet, "/api/projects", auth, nil)
	out.ProjectsStatus = status
	want = projectsStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}
	var list struct {
		Success  bool          `json:"success"`
		Projects []projectInfo `json:"projects"`
	}
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatalf("%s: decode projects envelope: %v", label, err)
	}
	if !list.Success {
		t.Fatalf("%s: envelope reports success=false", label)
	}
	deployPath := ""
	for i := range list.Projects {
		if list.Projects[i].Name != projectName {
			continue
		}
		out.ProjectFound = true
		// Project scope: the listed project carries the org scoping; when the
		// login context exposes exactly one org it must be that org.
		if list.Projects[i].OrgID != "" && (len(login.Orgs) != 1 || list.Projects[i].OrgID == login.ActiveOrgID) {
			out.OrgScopeConsistent = true
		}
		deployPath = fmt.Sprintf("/api/projects/%s/services", list.Projects[i].ID)
		break
	}
	if !out.ProjectFound {
		t.Fatalf("%s: project %q not found in the org-scoped list (seed it on the server first)", label, projectName)
	}

	// --- domain=services: platform envelope read ----------------------------
	label = "client=direct-http domain=services endpoint=GET /api/projects/<pid>/services"
	status, header, raw = leg.do(t, label, http.MethodGet, deployPath, auth, nil)
	out.ServicesStatus = status
	out.ServicesRIDPaired = header.Get("X-Request-ID") != "" && header.Get("X-Request-ID") == requestIDOf(raw)
	want = servicesStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}
	if !out.ServicesRIDPaired {
		t.Fatalf("%s: body request_id must equal the X-Request-ID response header", label)
	}

	// --- scope error: the platform namespace rejects anonymous reads --------
	label = "client=direct-http domain=services endpoint=GET /api/projects/<pid>/services (no token)"
	status, _, raw = leg.do(t, label, http.MethodGet, deployPath, nil, nil)
	out.ScopeStatus = status
	out.ScopeCode = requireCodeIn(t, label, raw, scopeCodesFor(fixtures))
	want = scopeCaseStatus(fixtures, 401)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}

	if out.SkippedMutation {
		t.Log("client=direct-http: RADAS_TEST_CATALOG_SLUG unset — read-only contract assertions only")
		return out
	}

	// --- domain=services: idempotent deploy mutation -------------------------
	name := fmt.Sprintf("cross-client-direct-%d", time.Now().UnixNano())
	payload := map[string]any{
		"name": name, "environment": "development", "catalog_slug": slug,
		"catalog_version": version, "runtime_id": "mock",
		"spec": map[string]any{"mode": "safe"}, "deploy": true,
	}
	key := fmt.Sprintf("cross-client-direct-%d", time.Now().UnixNano())
	mutate := map[string]string{"Authorization": auth["Authorization"], "Idempotency-Key": key}

	label = "client=direct-http domain=services endpoint=POST /api/projects/<pid>/services"
	status, header, raw = leg.do(t, label, http.MethodPost, deployPath, mutate, payload)
	out.DeployStatus = status
	out.DeployRIDPaired = header.Get("X-Request-ID") != "" && header.Get("X-Request-ID") == requestIDOf(raw)
	want = deployStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}
	var created operationEnvelope
	if err := json.Unmarshal(raw, &created); err != nil {
		t.Fatalf("%s: decode operation envelope: %v", label, err)
	}
	wantKind, wantOpStatus := "service.deploy", "queued"
	if fixtures != nil && fixtures.Steps.ServiceDeploy.Response.OperationValues.Kind != "" {
		wantKind = fixtures.Steps.ServiceDeploy.Response.OperationValues.Kind
		wantOpStatus = fixtures.Steps.ServiceDeploy.Response.OperationValues.Status
	}
	out.DeployKind = created.Operation.Kind
	out.DeployOpStatus = created.Operation.Status
	if created.Operation.ID == "" || created.Operation.InstanceID == "" {
		t.Fatalf("%s: envelope is missing operation id/instance_id", label)
	}
	if created.Operation.Kind != wantKind {
		t.Fatalf("%s: operation kind %q, want %q", label, created.Operation.Kind, wantKind)
	}
	if created.Operation.Status != wantOpStatus {
		t.Fatalf("%s: operation status %q, want %q", label, created.Operation.Status, wantOpStatus)
	}
	if !out.DeployRIDPaired {
		t.Fatalf("%s: body request_id must equal the X-Request-ID response header", label)
	}

	// --- domain=services: idempotent replay ----------------------------------
	label = "client=direct-http domain=services endpoint=POST /api/projects/<pid>/services (replay)"
	status, _, raw = leg.do(t, label, http.MethodPost, deployPath, mutate, payload)
	out.ReplayStatus = status
	want = replayStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}
	var replayed operationEnvelope
	if err := json.Unmarshal(raw, &replayed); err != nil {
		t.Fatalf("%s: decode replay envelope: %v", label, err)
	}
	out.ReplaySameOp = replayed.Operation.ID == created.Operation.ID &&
		replayed.Operation.InstanceID == created.Operation.InstanceID
	if !out.ReplaySameOp {
		t.Fatalf("%s: operation id changed (%s -> %s): idempotency replay is broken",
			label, created.Operation.ID, replayed.Operation.ID)
	}

	// --- domain=services: key reuse with a different body conflicts ----------
	label = "client=direct-http domain=services endpoint=POST /api/projects/<pid>/services (conflict)"
	other := map[string]any{
		"name": name + "-other", "environment": "development", "catalog_slug": slug,
		"catalog_version": version, "runtime_id": "mock",
		"spec": map[string]any{"mode": "fast"}, "deploy": true,
	}
	status, _, raw = leg.do(t, label, http.MethodPost, deployPath, mutate, other)
	out.ConflictStatus = status
	out.ConflictCode = requireCodeIn(t, label, raw, conflictCodesFor(fixtures))
	want = conflictStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}

	// --- domain=services: deploy without an Idempotency-Key is rejected ------
	label = "client=direct-http domain=services endpoint=POST /api/projects/<pid>/services (missing key)"
	noKey := map[string]string{"Authorization": auth["Authorization"]}
	status, _, raw = leg.do(t, label, http.MethodPost, deployPath, noKey, payload)
	out.MissingKeyStatus = status
	out.MissingKeyCode = requireCodeIn(t, label, raw, missingKeyCodesFor(fixtures))
	want = missingKeyStatusWant(fixtures)
	if status != want {
		t.Fatalf("%s: got status %d, want %d", label, status, want)
	}
	return out
}

// runGoClientLeg exercises the same flow through the production Go request
// stack (internal/client + cmd/auth auto-refresh).
func runGoClientLeg(t *testing.T, baseURL, username, password, projectName, slug, version string, fixtures *contractFixtures) parityOutcome {
	t.Helper()
	out := parityOutcome{SkippedMutation: slug == ""}

	// Isolate every piece of CLI local state (see server_contract_test.go).
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())
	t.Setenv("RADAS_API_URL", baseURL)
	t.Setenv("RADAS_TOKEN", "")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := &cobra.Command{}

	// --- domain=auth: login via the production client ------------------------
	label := "client=go domain=auth endpoint=POST /api/auth/login"
	loginClient := client.New(client.Config{BaseURL: baseURL, Timeout: 15 * time.Second})
	rid := client.NewRequestID()
	resp, err := loginClient.Do(ctx, http.MethodPost, "/api/auth/login",
		map[string]string{"username": username, "password": password},
		client.RequestOptions{RequestID: rid, IdempotencyKey: rid})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	out.LoginStatus = resp.StatusCode
	want := loginStatusWant(fixtures)
	if resp.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, resp.StatusCode, want)
	}
	requireEnvelopeKeys(t, label, resp.Body, loginFixtureKeys(fixtures))
	var login loginEnvelope
	decodeInto(t, resp, &login)
	if !login.Success || login.AccessToken == "" || login.RefreshToken == "" {
		t.Fatalf("%s: server returned no usable tokens", label)
	}
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

	// --- domain=projects: org-scoped project list ---------------------------
	label = "client=go domain=projects endpoint=GET /api/projects"
	resp, err = call(ctx, cmd, http.MethodGet, "/api/projects", nil, client.RequestOptions{})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	out.ProjectsStatus = resp.StatusCode
	want = projectsStatusWant(fixtures)
	if resp.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, resp.StatusCode, want)
	}
	var list struct {
		Success  bool          `json:"success"`
		Projects []projectInfo `json:"projects"`
	}
	decodeInto(t, resp, &list)
	if !list.Success {
		t.Fatalf("%s: envelope reports success=false", label)
	}
	deployPath := ""
	for i := range list.Projects {
		if list.Projects[i].Name != projectName {
			continue
		}
		out.ProjectFound = true
		if list.Projects[i].OrgID != "" && (len(login.Orgs) != 1 || list.Projects[i].OrgID == login.ActiveOrgID) {
			out.OrgScopeConsistent = true
		}
		deployPath = fmt.Sprintf("/api/projects/%s/services", list.Projects[i].ID)
		break
	}
	if !out.ProjectFound {
		t.Fatalf("%s: project %q not found in the org-scoped list (seed it on the server first)", label, projectName)
	}

	// --- domain=services: platform envelope read ----------------------------
	label = "client=go domain=services endpoint=GET /api/projects/<pid>/services"
	resp, err = call(ctx, cmd, http.MethodGet, deployPath, nil, client.RequestOptions{})
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	out.ServicesStatus = resp.StatusCode
	out.ServicesRIDPaired = resp.Header.Get("X-Request-Id") != "" &&
		resp.Header.Get("X-Request-Id") == requestIDOf(resp.Body)
	want = servicesStatusWant(fixtures)
	if resp.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, resp.StatusCode, want)
	}
	if !out.ServicesRIDPaired {
		t.Fatalf("%s: body request_id must equal the X-Request-Id response header", label)
	}

	// --- scope error: anonymous platform read through a bare client ----------
	label = "client=go domain=services endpoint=GET /api/projects/<pid>/services (no token)"
	anonymous := client.New(client.Config{BaseURL: baseURL, Timeout: 15 * time.Second})
	_, scopeErr := anonymous.Do(ctx, http.MethodGet, deployPath, nil, client.RequestOptions{})
	var scopeHTTP *client.HTTPError
	if !errors.As(scopeErr, &scopeHTTP) {
		t.Fatalf("%s: unexpected error %v", label, scopeErr)
	}
	out.ScopeStatus = scopeHTTP.StatusCode
	out.ScopeCode = requireCodeIn(t, label, []byte(scopeHTTP.Body), scopeCodesFor(fixtures))
	want = scopeCaseStatus(fixtures, 401)
	if scopeHTTP.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, scopeHTTP.StatusCode, want)
	}

	if out.SkippedMutation {
		t.Log("client=go: RADAS_TEST_CATALOG_SLUG unset — read-only contract assertions only")
		return out
	}

	// --- domain=services: idempotent deploy mutation -------------------------
	name := fmt.Sprintf("cross-client-go-%d", time.Now().UnixNano())
	payload := map[string]any{
		"name": name, "environment": "development", "catalog_slug": slug,
		"catalog_version": version, "runtime_id": "mock",
		"spec": map[string]any{"mode": "safe"}, "deploy": true,
	}
	opts := client.RequestOptions{
		RequestID:      client.NewRequestID(),
		IdempotencyKey: client.NewRequestID(),
		OrganizationID: login.ActiveOrgID,
	}

	label = "client=go domain=services endpoint=POST /api/projects/<pid>/services"
	resp, err = call(ctx, cmd, http.MethodPost, deployPath, payload, opts)
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	out.DeployStatus = resp.StatusCode
	out.DeployRIDPaired = resp.Header.Get("X-Request-Id") != "" &&
		resp.Header.Get("X-Request-Id") == requestIDOf(resp.Body)
	want = deployStatusWant(fixtures)
	if resp.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, resp.StatusCode, want)
	}
	var created operationEnvelope
	decodeInto(t, resp, &created)
	wantKind, wantOpStatus := "service.deploy", "queued"
	if fixtures != nil && fixtures.Steps.ServiceDeploy.Response.OperationValues.Kind != "" {
		wantKind = fixtures.Steps.ServiceDeploy.Response.OperationValues.Kind
		wantOpStatus = fixtures.Steps.ServiceDeploy.Response.OperationValues.Status
	}
	out.DeployKind = created.Operation.Kind
	out.DeployOpStatus = created.Operation.Status
	if created.Operation.ID == "" || created.Operation.InstanceID == "" {
		t.Fatalf("%s: envelope is missing operation id/instance_id", label)
	}
	if created.Operation.Kind != wantKind {
		t.Fatalf("%s: operation kind %q, want %q", label, created.Operation.Kind, wantKind)
	}
	if created.Operation.Status != wantOpStatus {
		t.Fatalf("%s: operation status %q, want %q", label, created.Operation.Status, wantOpStatus)
	}
	if !out.DeployRIDPaired {
		t.Fatalf("%s: body request_id must equal the X-Request-Id response header", label)
	}

	// --- domain=services: idempotent replay ----------------------------------
	label = "client=go domain=services endpoint=POST /api/projects/<pid>/services (replay)"
	resp, err = call(ctx, cmd, http.MethodPost, deployPath, payload, opts)
	if err != nil {
		t.Fatalf("%s: %v", label, err)
	}
	out.ReplayStatus = resp.StatusCode
	want = replayStatusWant(fixtures)
	if resp.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, resp.StatusCode, want)
	}
	var replayed operationEnvelope
	decodeInto(t, resp, &replayed)
	out.ReplaySameOp = replayed.Operation.ID == created.Operation.ID &&
		replayed.Operation.InstanceID == created.Operation.InstanceID
	if !out.ReplaySameOp {
		t.Fatalf("%s: operation id changed (%s -> %s): idempotency replay is broken",
			label, created.Operation.ID, replayed.Operation.ID)
	}

	// --- domain=services: key reuse with a different body conflicts ----------
	label = "client=go domain=services endpoint=POST /api/projects/<pid>/services (conflict)"
	other := map[string]any{
		"name": name + "-other", "environment": "development", "catalog_slug": slug,
		"catalog_version": version, "runtime_id": "mock",
		"spec": map[string]any{"mode": "fast"}, "deploy": true,
	}
	_, conflictErr := call(ctx, cmd, http.MethodPost, deployPath, other, opts)
	var conflictHTTP *client.HTTPError
	if !errors.As(conflictErr, &conflictHTTP) {
		t.Fatalf("%s: unexpected error %v", label, conflictErr)
	}
	out.ConflictStatus = conflictHTTP.StatusCode
	out.ConflictCode = requireCodeIn(t, label, []byte(conflictHTTP.Body), conflictCodesFor(fixtures))
	want = conflictStatusWant(fixtures)
	if conflictHTTP.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, conflictHTTP.StatusCode, want)
	}

	// --- domain=services: deploy without an Idempotency-Key is rejected ------
	label = "client=go domain=services endpoint=POST /api/projects/<pid>/services (missing key)"
	_, missingErr := call(ctx, cmd, http.MethodPost, deployPath, payload, client.RequestOptions{
		RequestID:      client.NewRequestID(),
		OrganizationID: login.ActiveOrgID,
	})
	var missingHTTP *client.HTTPError
	if !errors.As(missingErr, &missingHTTP) {
		t.Fatalf("%s: unexpected error %v", label, missingErr)
	}
	out.MissingKeyStatus = missingHTTP.StatusCode
	out.MissingKeyCode = requireCodeIn(t, label, []byte(missingHTTP.Body), missingKeyCodesFor(fixtures))
	want = missingKeyStatusWant(fixtures)
	if missingHTTP.StatusCode != want {
		t.Fatalf("%s: got status %d, want %d", label, missingHTTP.StatusCode, want)
	}
	return out
}

// assertParity compares the two legs step by step with actionable labels.
func assertParity(t *testing.T, direct, viaClient parityOutcome) {
	t.Helper()
	type check struct {
		domain, step string
		want, got    any
	}
	checks := []check{
		{"auth", "login status", direct.LoginStatus, viaClient.LoginStatus},
		{"projects", "list status", direct.ProjectsStatus, viaClient.ProjectsStatus},
		{"projects", "project scope: configured project listed", direct.ProjectFound, viaClient.ProjectFound},
		{"projects", "project scope: org context consistent", direct.OrgScopeConsistent, viaClient.OrgScopeConsistent},
		{"services", "services list status", direct.ServicesStatus, viaClient.ServicesStatus},
		{"services", "services list request_id pairing", direct.ServicesRIDPaired, viaClient.ServicesRIDPaired},
		{"services", "deploy status", direct.DeployStatus, viaClient.DeployStatus},
		{"services", "deploy request_id pairing", direct.DeployRIDPaired, viaClient.DeployRIDPaired},
		{"services", "deploy operation kind", direct.DeployKind, viaClient.DeployKind},
		{"services", "deploy operation status", direct.DeployOpStatus, viaClient.DeployOpStatus},
		{"services", "replay status", direct.ReplayStatus, viaClient.ReplayStatus},
		{"services", "replay keeps operation id", direct.ReplaySameOp, viaClient.ReplaySameOp},
		{"services", "conflict status", direct.ConflictStatus, viaClient.ConflictStatus},
		{"services", "missing-key status", direct.MissingKeyStatus, viaClient.MissingKeyStatus},
		{"services", "missing-key error code", direct.MissingKeyCode, viaClient.MissingKeyCode},
		{"services", "scope-error status", direct.ScopeStatus, viaClient.ScopeStatus},
		{"services", "scope-error code", direct.ScopeCode, viaClient.ScopeCode},
	}
	for _, c := range checks {
		if fmt.Sprintf("%v", c.want) != fmt.Sprintf("%v", c.got) {
			t.Fatalf("client=direct-http != client=go domain=%s step=%s: direct-http=%v go=%v",
				c.domain, c.step, c.want, c.got)
		}
	}
	if direct.SkippedMutation != viaClient.SkippedMutation {
		t.Fatalf("client=direct-http != client=go domain=services step=mutation gating: "+
			"direct-http skipped=%v go skipped=%v", direct.SkippedMutation, viaClient.SkippedMutation)
	}
}

func TestCrossClientContractParity(t *testing.T) {
	baseURL, username, password, projectName, slug, version := contractEnv(t)
	fixtures := loadCrossClientFixtures(t)

	if fixtures != nil && fixtures.ContractVersion != 1 {
		t.Fatalf("domain=contract: fixture contract_version %d, want 1", fixtures.ContractVersion)
	}

	direct := runDirectHTTPLeg(t, baseURL, username, password, projectName, slug, version, fixtures)
	viaClient := runGoClientLeg(t, baseURL, username, password, projectName, slug, version, fixtures)
	assertParity(t, direct, viaClient)

	t.Log("client=direct-http == client=go: login/read/mutation/replay parity holds" +
		" (TypeScript leg: apps/console/src/test/cross-client-fixtures.test.ts)")
}
