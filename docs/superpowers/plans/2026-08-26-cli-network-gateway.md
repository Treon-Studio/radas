# CLI Network Gateway & Friendly Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, fast, hybrid network gateway (`internal/netgate`) in RADAS CLI (`apps/cli`) that provides pre-execution guards and runtime error interception with clean, informative error messages for offline users.

**Architecture:** A dedicated `internal/netgate` package provides fast probing (~750ms timeout) with in-memory memoization, Cobra `PreRunE` middleware (`RequireNetwork`), programmatic guards (`EnsureConnected`), and runtime error translation (`WrapError`, `IsNetworkError`). This is integrated across updater, AI, HTTP client, Git remotes, and package manager commands.

**Tech Stack:** Go 1.25, Cobra CLI framework, Go standard `net`, `net/http`, `sync`.

## Global Constraints

- Target module: `apps/cli` (`github.com/raizora/radas/v4`).
- All network checks must be non-blocking or low-latency (<800ms) with in-memory caching to avoid slowing down CLI commands.
- TDD required: write failing tests first, then implement.

---

### Task 1: Implement `internal/netgate` Core Gateway & Error Handling

**Files:**
- Create: `apps/cli/internal/netgate/netgate.go`
- Create: `apps/cli/internal/netgate/netgate_test.go`

**Interfaces:**
- Produces:
  - `type Prober interface { Probe(ctx context.Context) error }`
  - `func SetProber(p Prober)`
  - `func ResetCache()`
  - `func IsConnected(ctx context.Context) bool`
  - `func EnsureConnected(featureName string) error`
  - `func RequireNetwork(featureName string) func(cmd *cobra.Command, args []string) error`
  - `func IsNetworkError(err error) bool`
  - `func WrapError(featureName string, err error) error`
  - `type NetworkRequiredError struct { Feature string, Cause error }`

- [ ] **Step 1: Write failing unit tests for `internal/netgate`**

Write tests covering:
1. `IsConnected` with mock prober returning nil (online) and error (offline).
2. Cache memoization: prober should only be invoked once per run unless `ResetCache()` is called.
3. `EnsureConnected` returns `NetworkRequiredError` when offline and nil when online.
4. `RequireNetwork` Cobra `PreRunE` halts command with formatted error when offline.
5. `IsNetworkError` correctly identifies `net.OpError`, `net.DNSError`, timeout errors.
6. `WrapError` returns formatted error containing feature name and suggestions.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli && go test ./internal/netgate -v`
Expected: FAIL (package not yet created).

- [ ] **Step 3: Implement `internal/netgate/netgate.go`**

Implement probing to `1.1.1.1:53`, `8.8.8.8:53`, and HTTP 204 endpoint with timeout, in-memory caching, error types, error formatting with Indonesian/English clarity, and Cobra helper.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/cli && go test ./internal/netgate -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/internal/netgate
git commit -m "feat(cli): implement internal/netgate network pre-check and error interceptor"
```

---

### Task 2: Integrate `netgate` into Updater & Version Check

**Files:**
- Modify: `apps/cli/cmd/setup/update.go`
- Modify: `apps/cli/internal/updater/updater.go`

**Interfaces:**
- Consumes: `netgate.RequireNetwork`, `netgate.WrapError`

- [ ] **Step 1: Write test for updater network error handling**

Update `apps/cli/internal/updater/updater_test.go` or `apps/cli/cmd/setup/setup_test.go` with offline simulation test.

- [ ] **Step 2: Run test to verify failure/expectation**

Run: `cd apps/cli && go test ./internal/updater -v`

- [ ] **Step 3: Implement `netgate` integration in `update.go` and `updater.go`**

Add `PreRunE: netgate.RequireNetwork("Pembaruan RADAS CLI")` on `UpdateCmd`, and wrap HTTP errors in `updater.go` with `netgate.WrapError("GitHub Release Server", err)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli && go test ./internal/updater ./cmd/setup -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/cmd/setup/update.go apps/cli/internal/updater/
git commit -m "feat(updater): guard CLI update command with netgate network check"
```

---

### Task 3: Integrate `netgate` into `internal/client` (HTTP Client Interceptor)

**Files:**
- Modify: `apps/cli/internal/client/client.go`
- Modify: `apps/cli/internal/client/client_test.go`

**Interfaces:**
- Consumes: `netgate.WrapError`, `netgate.IsNetworkError`

- [ ] **Step 1: Write failing test for client network error interception**

Add test in `internal/client/client_test.go` verifying that connection refused or invalid DNS errors are wrapped with informative `NetworkRequiredError`.

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/cli && go test ./internal/client -run TestClientNetworkError -v`

- [ ] **Step 3: Implement error interception in `client.do()`**

In `internal/client/client.go:168`, wrap transport errors (`c.httpClient.Do(req)`) with `netgate.WrapError("RADAS Server API", err)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli && go test ./internal/client -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/internal/client
git commit -m "feat(client): intercept transport errors with netgate in RADAS API client"
```

---

### Task 4: Integrate `netgate` into `internal/ai` (OpenAI & AI Features)

**Files:**
- Modify: `apps/cli/internal/ai/openai.go`
- Modify: `apps/cli/internal/ai/openai_test.go`

**Interfaces:**
- Consumes: `netgate.EnsureConnected`, `netgate.WrapError`

- [ ] **Step 1: Write test for AI offline guard**

Add test in `internal/ai/openai_test.go` verifying that when offline, `Client.Chat` and `Client.ExplainError` return a clean `NetworkRequiredError`.

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/cli && go test ./internal/ai -run TestAIOffline -v`

- [ ] **Step 3: Implement pre-check and error wrapping in `openai.go`**

Add `netgate.EnsureConnected("RADAS AI Assistant")` and wrap HTTP failures with `netgate.WrapError("OpenAI API", err)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli && go test ./internal/ai -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/internal/ai
git commit -m "feat(ai): protect AI assistant endpoints with netgate network check"
```

---

### Task 5: Integrate `netgate` into Git Remote Commands & Sync

**Files:**
- Modify: `apps/cli/cmd/git/push.go`
- Modify: `apps/cli/cmd/git/pull.go`
- Modify: `apps/cli/cmd/git/clone.go`
- Modify: `apps/cli/cmd/git/justpush.go`
- Modify: `apps/cli/cmd/sync/sync_repo.go`

**Interfaces:**
- Consumes: `netgate.RequireNetwork`

- [ ] **Step 1: Add unit tests for Git commands with `netgate.RequireNetwork`**

Add tests verifying `PreRunE` on `PushCmd`, `PullCmd`, `CloneCmd`, `JustPushCmd`, `SyncRepoCmd`.

- [ ] **Step 2: Attach `PreRunE` guards to git commands**

Attach `PreRunE: netgate.RequireNetwork("Operasi Git Remote")` to the remote Git Cobra commands.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/cli && go test ./cmd/git ./cmd/sync -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/cmd/git apps/cli/cmd/sync
git commit -m "feat(git): add netgate pre-check on remote git and sync commands"
```

---

### Task 6: Integrate `netgate` into Package Manager & Vuln Scan Commands

**Files:**
- Modify: `apps/cli/cmd/frontend/install.go`
- Modify: `apps/cli/cmd/frontend/vuln.go`
- Modify: `apps/cli/cmd/backend/install.go`
- Modify: `apps/cli/cmd/backend/vuln.go`

**Interfaces:**
- Consumes: `netgate.RequireNetwork`

- [ ] **Step 1: Attach `PreRunE: netgate.RequireNetwork(...)`**

Add `PreRunE` to frontend install/vuln and backend install/vuln commands.

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/cli && go test ./cmd/frontend ./cmd/backend -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/cmd/frontend apps/cli/cmd/backend
git commit -m "feat(pkg): attach netgate network check to install and vuln scan commands"
```

---

### Task 7: Full Verification & Binary Build

**Files:**
- None (verification task)

- [ ] **Step 1: Run all unit tests across the CLI**

Run: `cd apps/cli && go test ./...`
Expected: All tests pass (0 failures).

- [ ] **Step 2: Build the CLI binary**

Run: `cd apps/cli && go build -o bin/radas .`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Run `doctor` check and test `radas update` offline behavior**

Run: `./bin/radas doctor` and verify output.
