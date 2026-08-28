# RADAS CLI Network Gateway & Friendly Error Handling Spec

- **Date:** 2026-08-26
- **Status:** Approved
- **Target Area:** `apps/cli` (Go 1.25)
- **Package:** `internal/netgate`

---

## 1. Context & Motivation

Several commands and internal subsystems in the RADAS CLI (`apps/cli`) require external internet or remote network connectivity to function properly:
1. CLI self-update (`radas update`, version checker).
2. AI Intelligence features (`internal/ai` via OpenAI / LLM APIs).
3. Remote RADAS Stack / Control Plane calls (`internal/client` for cloud, finops, drift, flags, registry, policies, approvals).
4. Git remote actions (`radas git push/pull/clone/just-push`, `sync-repo`).
5. Package manager execution and remote vulnerability audits (`pnpm install`, `npm audit`, `go get`, `govulncheck`).

When the user is offline or experiencing network failure, raw socket errors (`dial tcp: lookup ...: no such host`, `connection refused`, `i/o timeout`) provide poor UX. This specification defines a lightweight, fast, hybrid network gateway (`internal/netgate`) that provides fast pre-execution guards and runtime error interception with informative, friendly, actionable error messages.

---

## 2. Architecture & Design

### 2.1 Package `internal/netgate`

The `internal/netgate` package provides:

1. **Fast Probing & Caching (`Probe / IsConnected`):**
   - Probes reliable endpoints (`1.1.1.1:53`, `8.8.8.8:53`, and `http://connectivitycheck.gstatic.com/generate_204`) with a short timeout (~750ms).
   - In-memory thread-safe memoization so repeated checks in the same CLI invocation take 0ms overhead.
   - Configurable dialer/prober for deterministic unit testing.

2. **Cobra Middleware Guard (`RequireNetwork`):**
   - Returns a `func(cmd *cobra.Command, args []string) error` compatible with Cobra's `PreRunE`.
   - Halts command execution immediately if offline before launching long-running processes.

3. **Programmatic Guard (`EnsureConnected`):**
   - Guard function for internal packages (`internal/ai`, `internal/client`, etc.) returning a structured `NetworkRequiredError`.

4. **Runtime Error Interception & Classification (`IsNetworkError / WrapError`):**
   - Inspects error chains (`errors.As`) for `net.OpError`, `net.DNSError`, `net.Error` (timeouts), and `syscall.ECONNREFUSED`.
   - Wraps raw transport errors into human-friendly contextual errors.

---

## 3. Error Output Formatting

```text
[✗] Koneksi Internet Diperlukan
    Fitur   : <Feature / Command Name>
    Detail  : Perintah ini memerlukan koneksi internet aktif untuk berkomunikasi dengan layanan luar.
    Saran   : Periksa koneksi Wi-Fi / jaringan internet Anda, lalu coba jalankan kembali perintah ini.
```

---

## 4. Integration Points

1. **`cmd/setup/update.go`:**
   - Attach `PreRunE: netgate.RequireNetwork("Pembaruan RADAS CLI")`.
2. **`internal/ai/openai.go`:**
   - Pre-check `netgate.EnsureConnected("RADAS AI Assistant")` before API calls.
3. **`internal/client/client.go`:**
   - Intercept HTTP failures in `do()` using `netgate.WrapError("RADAS Server API", err)`.
4. **`cmd/git/*.go` and `cmd/sync/sync_repo.go`:**
   - Attach `PreRunE: netgate.RequireNetwork("Operasi Git Remote")` on push, pull, clone, justpush.
5. **`cmd/frontend/*.go` & `cmd/backend/*.go` (`install`, `vuln`):**
   - Attach `PreRunE: netgate.RequireNetwork(...)` for package installs and remote vulnerability scans.
6. **Remote Control Plane Commands (`cmd/cloud`, `cmd/cost`, `cmd/drift`, `cmd/flags`, `cmd/registry`, `cmd/stack`, `cmd/worker`, etc.):**
   - Protected via `internal/client` wrapper and command PreRunE guards where applicable.

---

## 5. Testing & Verification Strategy

1. **Unit Tests (`internal/netgate/netgate_test.go`):**
   - Mock probers simulating online, offline, and timeout conditions.
   - Test cache memoization behavior.
   - Test Cobra `PreRunE` wrapper with mock commands.
   - Test error wrapping and formatting.
2. **Integration Verification:**
   - Run `go test ./...` in `apps/cli`.
   - Build CLI binary with `go build -o bin/radas .`.
   - Verify `radas update`, `radas git push`, and other commands handle offline scenarios gracefully.
