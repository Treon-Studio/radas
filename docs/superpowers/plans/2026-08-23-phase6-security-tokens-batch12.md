# Phase 6 Enterprise Security, Token Scopes & User Governance Implementation Plan (Batch 12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement login rate limiting, comprehensive audit log search and retention pruning, user invitation lifecycle with TTL, service account scoped tokens, token last-used tracking, and user session revocation (UC618, UC620, UC621, UC625, UC633, UC634, UC635).

**Architecture:**
- `services/login_security.py` & `auth/service.py` & `api/auth_routes.py`:
  - UC618: Rate limiting per key login (brute force protection per username & IP).
  - UC635: Revoke all user sessions by invalidating tokens issued prior to revocation timestamp.
- `services/audit_events.py`, `storage/auth_db.py` & `api/audit_log_routes.py`:
  - UC620: Comprehensive audit log search with multi-field filtering (query, actor, action, target, date range, pagination).
  - UC621: Configurable audit retention policy with pruning capability (`prune_audit_logs`).
- `services/user_invite_service.py` & `api/user_invite_routes.py`:
  - UC625: User invitation link with pre-assigned roles, org binding, expiration TTL, and claim flow.
- `storage/api_tokens_store.py` & `api_v2/api_tokens_routes.py`:
  - UC633: Service account scoped API tokens with granular permission checks (e.g. `["stacks:read", "stacks:apply", "deployments:*"]`).
  - UC634: Token list with `last_used_at` timestamp tracking.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC618 — Login Rate Limiting & Brute Force Protection

**Files:**
- Create: `apps/opensible-server/services/login_security.py`
- Modify: `apps/opensible-server/api/auth_routes.py`
- Test: `apps/opensible-server/tests/test_security_tokens_batch12_fase6.py`

**Interfaces:**
- Produces: `record_login_attempt(username: str, ip: str, success: bool) -> None`
- Produces: `is_login_rate_limited(username: str, ip: str, max_failures: int = 5, window_seconds: int = 60) -> Tuple[bool, int]`
- Produces: `reset_login_rate_limit(username: str, ip: str) -> None`

- [x] **Step 1: Write failing test in `test_security_tokens_batch12_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement `login_security.py` and integrate into `auth_routes.py`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC620 — Full-Text and Multi-field Audit Log Search

**Files:**
- Modify: `apps/opensible-server/storage/auth_db.py`
- Modify: `apps/opensible-server/services/audit_events.py`
- Modify: `apps/opensible-server/api/audit_log_routes.py`
- Test: `apps/opensible-server/tests/test_security_tokens_batch12_fase6.py`

**Interfaces:**
- Produces: `search_audit_events(query: Optional[str] = None, actor_user_id: Optional[str] = None, action: Optional[str] = None, target_type: Optional[str] = None, target_id: Optional[str] = None, start_time: Optional[str] = None, end_time: Optional[str] = None, project_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> Dict[str, Any]`
- Endpoint: `GET /api/audit-log/search`

- [x] **Step 1: Write failing test in `test_security_tokens_batch12_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement multi-field audit search in `storage/auth_db.py`, `services/audit_events.py`, and `api/audit_log_routes.py`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC621 — Configurable Audit Retention & Pruning

**Files:**
- Modify: `apps/opensible-server/storage/auth_db.py`
- Modify: `apps/opensible-server/services/audit_events.py`
- Modify: `apps/opensible-server/api/audit_log_routes.py`
- Test: `apps/opensible-server/tests/test_security_tokens_batch12_fase6.py`

**Interfaces:**
- Produces: `prune_audit_logs(retention_days: int = 90, project_id: Optional[str] = None) -> int`
- Endpoint: `POST /api/audit-log/prune`

- [x] **Step 1: Write failing test in `test_security_tokens_batch12_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement audit pruning in storage, service, and routes**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC625 — User Invitation Link with Pre-assigned Roles & TTL

**Files:**
- Create: `apps/opensible-server/services/user_invite_service.py`
- Create: `apps/opensible-server/api/user_invite_routes.py`
- Modify: `apps/opensible-server/app.py` (register blueprint)
- Test: `apps/opensible-server/tests/test_security_tokens_batch12_fase6.py`

**Interfaces:**
- Produces: `create_user_invite(email: str, roles: List[str], invited_by: str, org_id: Optional[str] = None, ttl_seconds: int = 604800) -> Dict[str, Any]`
- Produces: `get_user_invite(token: str) -> Optional[Dict[str, Any]]`
- Produces: `claim_user_invite(token: str, username: str, password: str) -> Dict[str, Any]`
- Produces: `list_user_invites(org_id: Optional[str] = None) -> List[Dict[str, Any]]`
- Produces: `revoke_user_invite(token: str) -> bool`
- Endpoints:
  - `POST /api/users/invites`
  - `GET /api/users/invites`
  - `GET /api/users/invites/<token>`
  - `POST /api/users/invites/<token>/claim`
  - `DELETE /api/users/invites/<token>`

- [x] **Step 1: Write failing test in `test_security_tokens_batch12_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement user invite service and API routes**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: UC633 & UC634 — Service Account Scoped API Tokens & Last-Used Tracking

**Files:**
- Modify: `apps/opensible-server/storage/api_tokens_store.py`
- Modify: `apps/opensible-server/api_v2/api_tokens_routes.py`
- Test: `apps/opensible-server/tests/test_security_tokens_batch12_fase6.py`

**Interfaces:**
- Produces: `is_token_scope_authorized(token_entry: Dict, required_scope: str) -> bool`
- Produces: `create_token(..., scopes: Optional[List[str]] = None)`
- Verifies: `lastUsedAt` is populated upon token verification.

- [x] **Step 1: Write failing test in `test_security_tokens_batch12_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement token scopes authorization and verification**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 6: UC635 — Revoke All User Sessions

**Files:**
- Modify: `apps/opensible-server/auth/service.py`
- Modify: `apps/opensible-server/api/auth_routes.py`
- Test: `apps/opensible-server/tests/test_security_tokens_batch12_fase6.py`

**Interfaces:**
- Produces: `revoke_all_user_sessions(user_id: str, data_dir: Path) -> float`
- Produces: `are_user_sessions_revoked(user_id: str, iat_timestamp: float, data_dir: Path) -> bool`
- Endpoint: `POST /api/auth/revoke-all-sessions`

- [x] **Step 1: Write failing test in `test_security_tokens_batch12_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement session revocation in `auth/service.py` and route**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 7: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC618, UC620, UC621, UC625, UC633, UC634, UC635 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
