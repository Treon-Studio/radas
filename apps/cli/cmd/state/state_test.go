package state

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
)

// runState executes a state subcommand with the runtime configuration pointed
// at srvURL and returns the combined cobra and stdout output together with the
// command error.
func runState(t *testing.T, srvURL string, args ...string) (string, error) {
	t.Helper()

	t.Setenv("RADAS_API_URL", srvURL)
	t.Setenv("RADAS_TOKEN", "")
	t.Setenv("RADAS_ORG_ID", "")
	t.Setenv("RADAS_PROJECT_ID", "proj-1")
	t.Setenv("RADAS_CONFIG_DIR", t.TempDir())

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("create pipe: %v", err)
	}
	os.Stdout = w

	var buf strings.Builder
	Cmd.SetOut(&buf)
	Cmd.SetErr(&buf)
	Cmd.SetArgs(args)
	cmdErr := Cmd.Execute()

	os.Stdout = old
	_ = w.Close()
	captured, _ := io.ReadAll(r)

	return buf.String() + string(captured), cmdErr
}

func statusServer(t *testing.T, code int, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_, _ = w.Write([]byte(body))
	}))
}

func stateBody(present bool, resources []string) string {
	if !present {
		return `{"state_present": false, "resource_count": 0, "resources": [], "message": "No terraform.tfstate on disk."}`
	}
	return `{"state_present": true, "resource_count": ` + strconv.Itoa(len(resources)) + `, "resources": ` + jsonString(resources) + `}`
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestStatePullReportsRealState(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(stateBody(true, []string{"aws_vpc.main", "aws_subnet.public_a"})))
	}))
	defer srv.Close()

	out, err := runState(t, srv.URL, "pull", "prod-vpc")
	if err != nil {
		t.Fatalf("state pull: %v", err)
	}
	if gotPath != "/api/cloud/stacks/prod-vpc/state" {
		t.Errorf("state pull must use GET /api/cloud/stacks/<name>/state, got %s", gotPath)
	}
	if !strings.Contains(out, "aws_vpc.main") {
		t.Errorf("real resource addresses missing from output:\n%s", out)
	}
	if strings.Contains(out, "\"version\": 4") || strings.Contains(out, "aws_internet_gateway.gw") {
		t.Errorf("fabricated tfstate JSON must not be printed:\n%s", out)
	}
}

func TestStatePullReportsAbsentStateHonestly(t *testing.T) {
	srv := statusServer(t, http.StatusOK, stateBody(false, nil))
	defer srv.Close()

	out, err := runState(t, srv.URL, "pull", "prod-vpc")
	if err != nil {
		t.Fatalf("state pull on absent state: %v", err)
	}
	if !strings.Contains(out, "not present") {
		t.Errorf("expected an honest absent-state report, got:\n%s", out)
	}
}

func TestStatePullServerErrorSurfaces(t *testing.T) {
	for _, code := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		srv := statusServer(t, code, `{"error":"Not found"}`)
		out, err := runState(t, srv.URL, "pull", "nope")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", code)
		}
		if !strings.Contains(out, "request req-") {
			t.Errorf("status %d: error output must carry the request ID:\n%s", code, out)
		}
	}
}

func TestStateUnlockUsesLockDeleteRoute(t *testing.T) {
	var (
		gotMethod string
		gotPath   string
		gotRawq   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotRawq = r.Method, r.URL.Path, r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok": true, "message": "lock released"}`))
	}))
	defer srv.Close()

	out, err := runState(t, srv.URL, "unlock", "prod-vpc", "-l", "lock_12345")
	if err != nil {
		t.Fatalf("state unlock: %v", err)
	}
	if gotMethod != http.MethodDelete || gotPath != "/api/cloud/stacks/prod-vpc/state/lock" {
		t.Errorf("unexpected call %s %s (must be DELETE /api/cloud/stacks/<name>/state/lock)", gotMethod, gotPath)
	}
	if !strings.Contains(gotRawq, "lock_id=lock_12345") {
		t.Errorf("lock_id query param missing: %s", gotRawq)
	}
	if !strings.Contains(out, "released") {
		t.Errorf("expected success text after server confirmation:\n%s", out)
	}
}

func TestStateUnlockFailureNeverPrintsSuccess(t *testing.T) {
	for _, tc := range []struct {
		code int
		body string
	}{
		{http.StatusConflict, `{"ok": false, "error": "lock id mismatch"}`},
		{http.StatusUnauthorized, `{"error":"boom"}`},
		{http.StatusNotFound, `{"error":"Not found"}`},
	} {
		srv := statusServer(t, tc.code, tc.body)
		out, err := runState(t, srv.URL, "unlock", "prod-vpc", "-l", "wrong")
		srv.Close()

		if err == nil {
			t.Errorf("status %d: expected an error, got success exit", tc.code)
		}
		if strings.Contains(out, "successfully") {
			t.Errorf("status %d: fake success printed:\n%s", tc.code, out)
		}
		if !strings.Contains(out, "request req-") && tc.code != http.StatusConflict {
			t.Errorf("status %d: error output must carry the request ID:\n%s", tc.code, out)
		}
	}
}

func TestStateUnlockOkFalseSurfacesServerMessage(t *testing.T) {
	srv := statusServer(t, http.StatusOK, `{"ok": false, "error": "lock id mismatch"}`)
	defer srv.Close()

	out, err := runState(t, srv.URL, "unlock", "prod-vpc", "-l", "wrong")
	if err == nil {
		t.Fatal("ok=false must surface as an error")
	}
	if !strings.Contains(out, "lock id mismatch") {
		t.Errorf("server message missing from error output:\n%s", out)
	}
}

func TestStateGraphRendersRealResourcesLocally(t *testing.T) {
	var stateHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/cloud/stacks/prod-vpc/state" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		stateHits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(stateBody(true, []string{"aws_vpc.main", "aws_subnet.public_a"})))
	}))
	defer srv.Close()

	out, err := runState(t, srv.URL, "graph", "prod-vpc")
	if err != nil {
		t.Fatalf("state graph: %v", err)
	}
	if stateHits != 1 {
		t.Errorf("state graph must fetch the real state exactly once, got %d hits", stateHits)
	}
	if !strings.Contains(out, "aws_vpc.main") || !strings.Contains(out, "aws_subnet.public_a") {
		t.Errorf("real resources missing from the rendered graph:\n%s", out)
	}
	for _, fake := range []string{"aws_internet_gateway.gw", "aws_route_table.public"} {
		if strings.Contains(out, fake) {
			t.Errorf("fabricated resource %q printed:\n%s", fake, out)
		}
	}
}

func TestStateGraphAbsentStateReportsHonestly(t *testing.T) {
	srv := statusServer(t, http.StatusOK, stateBody(false, nil))
	defer srv.Close()

	out, err := runState(t, srv.URL, "graph", "prod-vpc")
	if err != nil {
		t.Fatalf("state graph on absent state: %v", err)
	}
	if !strings.Contains(out, "nothing to render") {
		t.Errorf("expected an honest empty-graph report, got:\n%s", out)
	}
}
