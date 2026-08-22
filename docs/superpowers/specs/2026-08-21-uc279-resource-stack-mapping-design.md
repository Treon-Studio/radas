# UC279 Resource-to-Stack Import Mapping — Design

**Date:** 2026-08-21

## Goal

Close the smallest remaining UC279 slice by making BYOC resource import mapping explicitly project/stack scoped and deterministic:

> A permitted user can select resources from the latest account inventory, map them to one project-owned stack and safe OpenTofu resource addresses, and receive import blocks without executing OpenTofu.

## Current context

The repository already has `services.byoc.generate_import(account_id, resource_ids)` and `/api/byoc/accounts/<account_id>/import`. It validates duplicate and stale inventory IDs and emits import blocks, but it does not accept an explicit project/stack context, verify stack tenancy, or persist a mapping intent. UC279 remains ⬜ in `docs/ROADMAP.md`.

The existing BYOC account store is global KV-backed data. This slice does not redesign that store or attempt the broader UC302 account-access audit. The endpoint adds explicit project context and checks the target stack before producing output.

## Scope

### Included

- Extend the BYOC import request with required `project_id` and `stack` fields.
- Validate that the caller may access the project and that the requested stack belongs to that project.
- Validate selected resources against the account's latest inventory.
- Support optional `address_overrides` keyed by resource ID.
- Validate addresses as safe OpenTofu resource addresses; reject traversal, shell syntax, whitespace, and arbitrary paths.
- Return deterministic resource mappings and import blocks.
- Persist a redacted mapping intent in the project stack metadata so a later apply workflow can inspect it, without running a provider or OpenTofu command.
- Preserve duplicate/stale-resource rejection and existing managed-resource metadata.
- Add focused service and route tests for success, deterministic output, access isolation, validation, and no execution side effects.

### Excluded

- Running `tofu import`, `plan`, `apply`, or any provider API operation.
- Creating a new stack or changing stack files/state.
- Importing resources from accounts belonging to another tenant.
- Account-store redesign, account CRUD authorization overhaul, or UC302 audit instrumentation.
- Batch scheduling, rollback, import-only lifecycle, or automatic adoption.

## API contract

`POST /api/byoc/accounts/<account_id>/import`

Request JSON:

```json
{
  "project_id": "project-a",
  "stack": "network-prod",
  "resource_ids": ["resource-1", "resource-2"],
  "address_overrides": {
    "resource-1": "hcloud_server.web"
  }
}
```

Response `200`:

```json
{
  "account_id": "account-a",
  "project_id": "project-a",
  "stack": "network-prod",
  "provider": "hetzner",
  "resource_count": 2,
  "mappings": [
    {
      "resource_id": "resource-1",
      "type": "hcloud_server",
      "address": "hcloud_server.web",
      "source": "override"
    },
    {
      "resource_id": "resource-2",
      "type": "hcloud_server",
      "address": "hcloud_server.worker",
      "source": "inventory"
    }
  ],
  "import_block": "import {\n  to = hcloud_server.web\n  id = \"resource-1\"\n}\n\n..."
}
```

The response contains no credentials, raw account data, filesystem path, state payload, or provider response. Resource IDs and addresses are limited to the selected inventory projection and validated override values.

## Authorization and tenant boundary

1. Authenticate the request using the existing `require_auth` route guard.
2. Resolve `project_id` from the request body and query `projects` by ID.
3. Require the current user to be a member of the project's organization. Internal calls may use the existing internal context.
4. Verify the target stack exists in the project-scoped stack metadata/workspace and reject an unknown stack with `404`.
5. Verify the account is authorized for the same organization/project context. Until account ownership is migrated to relational tenant data, use an explicit account-to-project association in the mapping request/store; never infer authorization from an arbitrary account ID alone.
6. Reject a project or account from another organization without revealing whether the resource or stack exists.

The implementation must not silently fall back to a default project or stack. Missing `project_id`/`stack` is a `400` validation error.

## Deterministic mapping

- Preserve `resource_ids` in a canonical sorted order by string resource ID; output mappings and import blocks use that order.
- Reject duplicate IDs and IDs absent from the latest inventory.
- For each resource, use `address_overrides[resource_id]` when supplied; otherwise use the inventory's existing `address`; if neither exists, derive only the validated form `<type>.<sanitized_name>`.
- A valid address matches one or more Terraform identifiers separated by dots and optional numeric/index selectors; it cannot contain `/`, `\\`, whitespace, `;`, `&`, `|`, `$`, backticks, quotes, or `..`.
- An override may not map two different resource IDs to the same address.
- Import block IDs are encoded as quoted strings; addresses are emitted as validated HCL address tokens, never shell commands.
- Store only `{resource_id, type, address, source, mapped_at}` in the redacted mapping intent.

## Persistence and side effects

Persist the mapping intent under the project/stack metadata using the existing stack metadata helper or a narrowly scoped JSON field. The write is atomic with respect to the metadata update. It must not write `terraform.tfstate`, credentials, provider data, or run queue records.

The operation is a control-plane preparation step. It returns the mapping immediately and does not invoke `_create_execution`, subprocesses, network provider clients, or OpenTofu.

## Error contract

- `400`: missing project/stack/resource IDs, malformed address override, duplicate resource IDs, duplicate addresses.
- `403`: caller lacks project/account tenant access.
- `404`: project, account, stack, or selected inventory resource is not accessible/found; do not distinguish cross-tenant existence.
- `500`: unexpected persistence failure; do not expose exception details or raw paths.

Existing legacy requests that omit project/stack must no longer be accepted for this UC279 endpoint; callers receive an explicit validation error rather than an implicit default scope.

## Testing

Add focused tests covering:

1. One and multiple resources produce deterministic mappings and import block order.
2. Valid `address_overrides` replace inventory addresses and are marked `source: override`.
3. Invalid addresses and duplicate target addresses are rejected.
4. Duplicate and stale resource IDs remain rejected.
5. Missing project/stack is rejected; no default scope is used.
6. A project member can map resources only to a stack in their project.
7. Cross-organization project/stack/account requests are denied without resource or path leakage.
8. Mapping persistence contains only redacted mapping fields and does not create execution records or state files.
9. Existing account/inventory data remains unchanged after mapping.

Required verification commands:

```bash
cd apps/opensible-server
.venv/bin/pytest -q tests/test_byoc_hardening.py tests/test_byoc_routes.py tests/test_byoc_mapping.py
.venv/bin/python -m compileall -q services api storage
```

If `tests/test_byoc_routes.py` is absent in the current checkout, create the focused route coverage in `tests/test_byoc_mapping.py` rather than claiming the missing suite passed.

## Acceptance criteria

UC279 is complete for this slice only when:

- The import endpoint requires explicit project and stack scope.
- Resource IDs are validated against the latest account inventory.
- Mapping output is deterministic and supports safe address overrides.
- Cross-tenant/project/stack access is rejected.
- The mapping intent is persisted without credentials, paths, state writes, provider calls, or OpenTofu execution.
- Focused service and route tests cover all listed cases.
- Backend compileall and focused tests pass.
- The roadmap row is changed from ⬜ only after these criteria are evidenced; unrelated UC302 and Phase 3–5 rows remain unchanged.
