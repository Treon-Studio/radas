# GitHub OAuth Per-Tenant Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ubah koneksi GitHub dari machine-level (`gh` CLI di server) menjadi **per-tenant OAuth**: user diarahkan ke GitHub untuk authorize (read + list repos), token disimpan terenkripsi per org/project, dan repos/workflows/runs dibaca dengan token tenant tersebut.

**Architecture:** `services/github_oauth.py` (sudah dibuat) menyediakan OAuth authorize/exchange, penyimpanan token per-tenant di `kv_store` scope `github_conn` (terenkripsi via `get_encryption`), dan GitHub API calls dengan token. `api/github_oauth_routes.py` (sudah dibuat, blueprint terdaftar) mengekspos status/authorize/callback/connect-pat/disconnect + repos/workflows/runs. Yang tersisa: unit tests, UI console (Connect OAuth + fallback PAT), dan verifikasi end-to-end.

**Tech Stack:** Python 3.14 + Flask + psycopg (`storage/kv.py`), GitHub OAuth App flow (`github.com/login/oauth/authorize` + `/access_token`), React 19 + TanStack Router/Query.

## Global Constraints
- Server venv: `apps/opensible-server/.venv/bin/python -m pytest` (pytest 8.x); test memakai `TEST_DATABASE_URL` (default `postgresql://localhost/radas_test`), schema di-reset per test via fixture `pg_db`.
- Token GitHub **tidak boleh disimpan plaintext** — selalu lewat `get_encryption()` (service `github_oauth._enc/_dec` sudah melakukannya).
- `DATABASE_URL` wajib; jangan menyentuh `storage/pg.py`/`pg_schema.py` (sudah stabil).
- Console: `pnpm --filter @radas/console typecheck` dan `build` PASS; UI pakai kit `@/components/ui/{button,input,select,badge,card}`.
- Aditif — kontrak API lama (`/api/github/*` via gh CLI) tetap ada; endpoint baru di bawah `/api/github/oauth/*`.
- Env OAuth: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI` (opsional, default `http://localhost:5001/api/github/oauth/callback`).

---

### Task 1: Unit tests — service github_oauth (mock `requests`)

**Files:**
- Create: `apps/opensible-server/tests/test_github_oauth.py`
- Test: same file

**Interfaces:**
- Consumes: `services.github_oauth` public API — `tenant_key(org_id, project_id)`, `oauth_configured()`, `redirect_uri()`, `authorize_url(state)`, `exchange_code(code)`, `save_connection(tenant, access_token, owner)`, `get_connection(tenant)`, `delete_connection(tenant)`, `connection_status(tenant)`, `me(token)`, `list_repos(token, owner)`, `repo_workflows(token, owner, repo)`, `workflow_runs(token, owner, repo, per_page)`, `dispatch(token, owner, repo, workflow_file, ref, inputs)`, `rerun(token, owner, repo, run_id)`, `cancel(token, owner, repo, run_id)`.
- Produces: nothing new (tests only) — but fixes any bug the tests expose (mock `requests` so no real GitHub call).

- [ ] **Step 1: Write failing tests**

```python
"""Unit tests for per-tenant GitHub OAuth (Fase 7). Mocks `requests`."""
from __future__ import annotations

import json
import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")

import pytest

from storage import pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


def _fake_resp(status=200, payload=None, text=""):
    class R:
        def __init__(self, status, payload, text):
            self.status_code = status
            self._payload = payload
            self.text = text

        def json(self):
            return self._payload

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(self.text or f"HTTP {self.status_code}")

    return R(status, payload, text)


def test_tenant_key_org_preferred():
    from services.github_oauth import tenant_key
    assert tenant_key(org_id="o1", project_id="p1") == "org:o1"
    assert tenant_key(project_id="p1") == "project:p1"
    assert tenant_key() == "org:default"


def test_authorize_url_contains_client_id_and_scope(monkeypatch):
    from services.github_oauth import authorize_url, oauth_configured
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_ID", "cid123")
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_SECRET", "csec")
    assert oauth_configured() is True
    url = authorize_url("tenant:org:o1")
    assert "client_id=cid123" in url
    assert "scope=read%3Aorg+repo" in url or "scope=read:org" in url
    assert "state=tenant%3Aorg%3Ao1" in url


def test_exchange_code_returns_token(monkeypatch):
    import services.github_oauth as g
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_SECRET", "sec")
    monkeypatch.setattr(g.requests, "post",
                        lambda *a, **k: _fake_resp(200, {"access_token": "tok123", "token_type": "bearer"}))
    assert g.exchange_code("code1")["access_token"] == "tok123"


def test_exchange_code_error_raises(monkeypatch):
    import services.github_oauth as g
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_SECRET", "sec")
    monkeypatch.setattr(g.requests, "post",
                        lambda *a, **k: _fake_resp(200, {"error": "bad_verification_code"}))
    try:
        g.exchange_code("bad")
        assert False, "should raise"
    except RuntimeError as e:
        assert "bad_verification_code" in str(e)


def test_save_get_delete_connection_roundtrip(pg_db):
    from services.github_oauth import delete_connection, get_connection, save_connection, connection_status
    save_connection("org:o1", "secret-token", "octocat")
    conn = get_connection("org:o1")
    assert conn is not None
    assert conn["access_token"] == "secret-token"  # decrypted
    assert conn["owner"] == "octocat"
    st = connection_status("org:o1")
    assert st["connected"] is True and st["owner"] == "octocat"
    assert delete_connection("org:o1") is True
    assert get_connection("org:o1") is None


def test_connection_not_stored_plaintext(pg_db):
    from services.github_oauth import save_connection
    from storage import kv
    save_connection("org:o1", "topsecret", "owner1")
    raw = kv.kv_get("github_conn", "org:o1")
    assert "topsecret" not in str(raw["access_token"])


def test_list_repos_parses(monkeypatch):
    import services.github_oauth as g
    repos = [{"name": "a", "full_name": "u/a", "default_branch": "main",
              "visibility": "public", "description": None, "archived": False},
             {"name": "b", "full_name": "u/b", "default_branch": "main",
              "visibility": "private", "description": "x", "archived": True}]
    monkeypatch.setattr(g.requests, "request",
                        lambda *a, **k: _fake_resp(200, repos))
    out = g.list_repos("tok", "u")
    assert len(out) == 1 and out[0]["name"] == "a"  # archived filtered


def test_repo_workflows_parses(monkeypatch):
    import services.github_oauth as g
    body = {"workflows": [{"id": 1, "name": "ci", "path": ".github/workflows/ci.yml",
                           "state": "active", "created_at": "2024-01-01"}]}
    monkeypatch.setattr(g.requests, "request", lambda *a, **k: _fake_resp(200, body))
    out = g.repo_workflows("tok", "u", "r")
    assert out[0]["name"] == "ci" and out[0]["state"] == "active"


def test_dispatch_error_propagates(monkeypatch):
    import services.github_oauth as g
    monkeypatch.setattr(g.requests, "request",
                        lambda *a, **k: _fake_resp(404, {}, "Not Found"))
    out = g.dispatch("tok", "u", "r", "w.yml")
    assert out["ok"] is False and "404" in out["error"]


def test_me_returns_login(monkeypatch):
    import services.github_oauth as g
    monkeypatch.setattr(g.requests, "request",
                        lambda *a, **k: _fake_resp(200, {"login": "octocat"}))
    assert g.me("tok")["login"] == "octocat"
```

- [ ] **Step 2: Run — expect mostly pass, fix gaps**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_github_oauth.py -q`
Expected: PASS (service already implemented). If `test_connection_not_stored_plaintext` fails, the service must encrypt — verify `_enc` uses `get_encryption()` (it does). If `test_list_repos_parses` fails on pagination (`_gh_api_list` appends `per_page`), fix the mock to handle the query-string path (the real `requests.request` is called with the full URL including `?per_page=...`; the mock ignores args, fine).

- [ ] **Step 3: Full suite + commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3`
Expected: PASS (existing 106 + 9 new).

```bash
git add apps/opensible-server/tests/test_github_oauth.py
git commit -m "test(gh): unit tests for per-tenant GitHub OAuth service (Fase 7)"
```

---

### Task 2: Route-level tests — status/connect-pat/disconnect/callback

**Files:**
- Create: `apps/opensible-server/tests/test_github_oauth_routes.py`
- Modify (only if a test exposes a bug): `apps/opensible-server/api/github_oauth_routes.py`

**Interfaces:**
- Consumes: routes from Task 1's service — `GET /api/github/oauth/status`, `GET /api/github/oauth/authorize`, `GET /api/github/oauth/callback`, `POST /api/github/oauth/connect-pat`, `POST /api/github/oauth/disconnect`, `GET /api/github/oauth/repos`.
- Produces: nothing new — pins route contracts.

- [ ] **Step 1: Write failing tests (real JWT + test_client)**

```python
"""Route tests for GitHub OAuth per-tenant endpoints (Fase 7)."""
from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-at-least-32-chars-long!!")
os.environ.setdefault("INTERNAL_CALL_SECRET", "test-internal-call-secret-at-least-32-chars")

import pytest

from storage import pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


def _seed_user(uid="u1", name="alice"):
    from storage import pg as p
    p.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
              (uid, name, "x"))


def _token(uid="u1", username="alice", org_id=None):
    from auth.service import generate_token
    return generate_token(uid, username, ["admin"], Path("/tmp"),
                          token_type="access", org_id=org_id)


def _client():
    import flask
    from api import github_oauth_routes as ghr
    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(ghr.bp)
    return app.test_client()


def test_status_not_connected(pg_db):
    _seed_user()
    r = _client().get("/api/github/oauth/status", headers={
        "Authorization": f"Bearer {_token()}",
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body["connected"] is False


def test_status_connected_after_pat(pg_db, monkeypatch):
    _seed_user()
    import services.github_oauth as g
    monkeypatch.setattr(g.requests, "request",
                        lambda *a, **k: _fake_resp(200, {"login": "octocat"}))
    c = _client()
    r = c.post("/api/github/oauth/connect-pat",
               json={"token": "ghp_secret123"},
               headers={"Authorization": f"Bearer {_token(org_id='o1')}"})
    assert r.status_code == 201
    st = c.get("/api/github/oauth/status",
               headers={"Authorization": f"Bearer {_token(org_id='o1')}"}).get_json()
    assert st["connected"] is True and st["owner"] == "octocat"


def test_connect_pat_rejects_invalid(monkeypatch):
    _seed_user()
    import services.github_oauth as g
    monkeypatch.setattr(g.requests, "request",
                        lambda *a, **k: (_fake_resp(401, {}, "Bad credentials")))
    r = _client().post("/api/github/oauth/connect-pat",
                       json={"token": "bad"},
                       headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 400
    assert "Token tidak valid" in r.get_json()["error"]


def test_authorize_requires_oauth_config(monkeypatch):
    _seed_user()
    monkeypatch.delenv("GITHUB_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GITHUB_OAUTH_CLIENT_SECRET", raising=False)
    r = _client().get("/api/github/oauth/authorize",
                      headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 400
    assert "OAuth App" in r.get_json()["error"]


def test_authorize_returns_url_when_configured(monkeypatch):
    _seed_user()
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setenv("GITHUB_OAUTH_CLIENT_SECRET", "sec")
    r = _client().get("/api/github/oauth/authorize",
                      headers={"Authorization": f"Bearer {_token(org_id='o1')}"})
    assert r.status_code == 200
    body = r.get_json()
    assert "github.com/login/oauth/authorize" in body["authorize_url"]
    assert body["tenant"] == "org:o1"


def test_disconnect_not_connected_404(pg_db):
    _seed_user()
    r = _client().post("/api/github/oauth/disconnect",
                       headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 404


class _fake_resp:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload
```

- [ ] **Step 2: Run — fix tenant resolution if needed**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/test_github_oauth_routes.py -q`
Expected: PASS. Note `_tenant_from_request()` uses `request.current_user["org_id"]` set by `require_auth` from the JWT — the test passes `org_id` into `generate_token`, so `request.current_org_id`/`current_user.org_id` is set. If `require_auth` needs a DB hit for the user, the seeded user covers it. If a test fails on `current_user` shape, verify `auth/middleware.py` sets `org_id` in `request.current_user` (it does — added in Fase 7 D3).

- [ ] **Step 3: Full suite + commit**

Run: `cd apps/opensible-server && .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3`
Expected: PASS (existing + 6 new).

```bash
git add apps/opensible-server/tests/test_github_oauth_routes.py
git commit -m "test(gh): route tests for OAuth status/connect-pat/authorize/disconnect (Fase 7)"
```

---

### Task 3: Console — ConnectCard (OAuth + PAT + status + disconnect)

**Files:**
- Create: `apps/radas-console/src/components/system/GithubConnectCard.tsx`
- Modify: `apps/radas-console/src/routes/system/github-actions.tsx` (render card + switch repos/workflows/runs to oauth endpoints)

**Interfaces:**
- Consumes: backend routes `GET /api/github/oauth/status`, `GET /api/github/oauth/authorize`, `POST /api/github/oauth/connect-pat`, `POST /api/github/oauth/disconnect`, `GET /api/github/oauth/repos?owner=`, `GET /api/github/oauth/repos/<owner>/<repo>/workflows`, `GET /api/github/oauth/repos/<owner>/<repo>/runs`, `POST /api/github/oauth/repos/<owner>/<repo>/dispatch`.
- Produces: `GithubConnectCard` component with props `{ onConnected: () => void }`; exported named. The card fetches status, offers two flows (OAuth redirect button / PAT input), shows owner badge, and a disconnect button.

- [ ] **Step 1: Write the component**

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RiGithubLine as Github, RiLinkM as Link, RiLogoutBoxRLine as Disconnect } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type OAuthStatus = {
  connected: boolean;
  tenant: string;
  owner?: string;
  connected_at?: number;
  oauth_configured?: boolean;
};

export function GithubConnectCard({ onConnected }: { onConnected: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["gh-oauth-status"],
    queryFn: () => api<OAuthStatus>("GET", "/api/github/oauth/status"),
  });
  const [pat, setPat] = useState("");

  const connectPat = useMutation({
    mutationFn: () => api("POST", "/api/github/oauth/connect-pat", { token: pat }),
    onSuccess: () => {
      toast.success("GitHub terhubung");
      setPat("");
      qc.invalidateQueries({ queryKey: ["gh-oauth-status"] });
      qc.invalidateQueries({ queryKey: ["gh-oauth-repos"] });
      onConnected();
    },
    onError: (e: any) => toast.error(e?.message || "Gagal terhubung"),
  });

  const startOAuth = async () => {
    try {
      const d = await api<{ authorize_url: string }>("GET", "/api/github/oauth/authorize");
      window.location.href = d.authorize_url;
    } catch (e: any) {
      toast.error(e?.message || "OAuth belum dikonfigurasi — pakai PAT");
    }
  };

  const disconnect = useMutation({
    mutationFn: () => api("POST", "/api/github/oauth/disconnect"),
    onSuccess: () => {
      toast.success("GitHub diputus");
      qc.invalidateQueries({ queryKey: ["gh-oauth-status"] });
      qc.invalidateQueries({ queryKey: ["gh-oauth-repos"] });
      onConnected();
    },
    onError: (e: any) => toast.error(e?.message || "Gagal memutus"),
  });

  const connected = data?.connected ?? false;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Github className="h-4 w-4" /> GitHub Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 text-sm">
        {connected ? (
          <div className="flex items-center gap-2">
            <Badge variant="success">connected</Badge>
            <span className="font-mono">{data?.owner}</span>
            <Button size="sm" variant="ghost" className="ml-auto text-[var(--color-destructive)]"
              onClick={() => disconnect.mutate()}>
              <Disconnect className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[var(--color-muted-foreground)]">
              Hubungkan akun GitHub untuk akses repo per-tenant (diarahkan ke GitHub untuk authorize).
            </div>
            <Button size="sm" onClick={startOAuth}>
              <Link className="h-3.5 w-3.5" /> Connect via GitHub OAuth
            </Button>
            <div className="flex items-center gap-2">
              <div className="text-xs text-[var(--color-muted-foreground)] shrink-0">atau PAT:</div>
              <Input type="password" value={pat} onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_…" className="h-8 font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => connectPat.mutate()}
                disabled={!pat.trim() || connectPat.isPending}>
                Connect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into github-actions.tsx**

In `apps/radas-console/src/routes/system/github-actions.tsx`:
1. Import: `import { GithubConnectCard } from "@/components/system/GithubConnectCard";`
2. Replace the status query (`gh-status` → `gh-oauth-status`) and repos query (`/api/github/repos` → `/api/github/oauth/repos`), gating on `oauthConnected`:

```tsx
const { data: statusData } = useQuery({
  queryKey: ["gh-oauth-status"],
  queryFn: () => api<{ connected: boolean; owner?: string }>("GET", "/api/github/oauth/status"),
});
const { data: repoData } = useQuery({
  queryKey: ["gh-oauth-repos"],
  queryFn: () => api<{ repos: Repo[] }>("GET", "/api/github/oauth/repos"),
  enabled: !!statusData?.connected,
});
const oauthConnected = !!statusData?.connected;
```

3. Swap workflows/runs/dispatch/rerun/cancel endpoints to `/api/github/oauth/...`. Concretely replace these calls in `github-actions.tsx`:

```tsx
// workflows query (replace /api/github/repos/.../workflows)
queryFn: () => api<{ workflows: Workflow[] }>("GET", `/api/github/oauth/repos/${owner}/${repoName}/workflows`),
// runs query (replace /api/github/repos/.../runs)
queryFn: () => api<{ runs: Run[] }>("GET", `/api/github/oauth/repos/${owner}/${repoName}/runs`),
// dispatch (replace /api/github/repos/.../dispatch)
mutationFn: () => api("POST", `/api/github/oauth/repos/${owner}/${repoName}/dispatch`, { workflow_file, ref, inputs: inputs ? JSON.parse(inputs) : undefined }),
// rerun (replace /api/github/repos/.../runs/<id>/rerun)
mutationFn: (runId: number) => api("POST", `/api/github/oauth/repos/${owner}/${repoName}/runs/${runId}/rerun`),
// cancel (replace /api/github/repos/.../runs/<id>/cancel)
mutationFn: (runId: number) => api("POST", `/api/github/oauth/repos/${owner}/${repoName}/runs/${runId}/cancel`),
```

The response shapes are identical to the gh-CLI endpoints, so only the path strings change; keep `owner`, `repoName`, `workflowFile`, `ref`, `inputs`, `runId` variable names as-is.
4. Replace the existing "not configured" block with `<GithubConnectCard onConnected={() => { qc.invalidateQueries({ queryKey: ["gh-oauth-status"] }); }} />` and render the repos section only when `oauthConnected`.

- [ ] **Step 3: Typecheck + build**

Run: `cd /Users/ridho/Documents/go/github.com/raizora/radas && pnpm --filter @radas/console typecheck && pnpm --filter @radas/console build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/radas-console/src/components/system/GithubConnectCard.tsx apps/radas-console/src/routes/system/github-actions.tsx
git commit -m "feat(ui): GitHub OAuth connect card + repos/workflows via tenant token (Fase 7)"
```

---

### Task 4: End-to-end verification + ROADMAP + docs

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/postgres-neon.md` (tambah section GitHub OAuth), `ecosystem.config.cjs` (tambah env OAuth placeholder)

- [ ] **Step 1: Add OAuth env to ecosystem**

In `ecosystem.config.cjs`, server `env` block add:

```js
        GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID || "",
        GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET || "",
        GITHUB_OAUTH_REDIRECT_URI: process.env.GITHUB_OAUTH_REDIRECT_URI || "http://localhost:5001/api/github/oauth/callback",
```

- [ ] **Step 2: Smoke — PAT flow with a real token**

```bash
pm2 restart radas-server && sleep 3
TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin12345"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
# status sebelum connect (harus connected=false)
curl -s http://localhost:5001/api/github/oauth/status -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# connect PAT (gunakan token gh asli dari keyring bila ada; kalau tidak, cukup uji error path)
curl -s -X POST http://localhost:5001/api/github/oauth/connect-pat -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"token":"ghp_TEST_INVALID"}' | python3 -m json.tool
```

Expected: status `connected: false`; connect-pat with invalid token returns 400 `Token tidak valid`. Do NOT commit any real token.

- [ ] **Step 3: Verify OAuth configure-guard**

```bash
curl -s http://localhost:5001/api/github/oauth/authorize -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: 400 with "OAuth App belum dikonfigurasi" (client id empty in ecosystem until user registers an app). This documents the guard works.

- [ ] **Step 4: ROADMAP + docs**

Mark relevant GitHub/Uses cases in `docs/ROADMAP.md` (search section M for GitHub rows) as ✅ where the OAuth per-tenant connect now covers them (e.g. `216` Koneksi GitHub per-tenant OAuth, repo list, workflows, runs, dispatch, rerun, cancel). Update `docs/postgres-neon.md` with a short "GitHub OAuth per-tenant" subsection:

```markdown
## GitHub OAuth per-tenant

- User diarahkan ke GitHub (`/login/oauth/authorize`, scope `read:org repo`),
  token disimpan terenkripsi di `kv_store` scope `github_conn` per org/project.
- Env: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`,
  `GITHUB_OAUTH_REDIRECT_URI` (default `http://localhost:5001/api/github/oauth/callback`).
- Fallback: `POST /api/github/oauth/connect-pat` menyimpan PAT per-tenant
  (tetap terenkripsi). Endpoints: `/api/github/oauth/{status,authorize,
  callback,connect-pat,disconnect,repos,...}`.
```

- [ ] **Step 5: Full verification + push**

```bash
cd apps/opensible-server && .venv/bin/python -m pytest tests/ -q 2>&1 | tail -3
cd ../.. && pnpm --filter @radas/console typecheck && pnpm --filter @radas/console build
git add -A
git commit -m "feat(gh): per-tenant OAuth connect — UI, tests, docs (Fase 7)"
git push origin main
```
