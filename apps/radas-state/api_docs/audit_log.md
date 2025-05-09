# AuditLog API Documentation

## Module: `RadasState.AuditLog`

Audit logging utilities for tracking changes and actions in the system.

### Functions

#### `log/3`

```
@spec log(event :: atom(), type :: atom(), payload :: any()) :: :ok
```

Logs an audit event with the given type and payload.

- `event`: The kind of audit event (e.g., `:create`, `:update`, `:delete`).
- `type`: The entity type being audited (e.g., `:feature_flag`, `:environment`).
- `payload`: The data associated with the event (usually a struct or map).

**Example:**

```elixir
RadasState.AuditLog.log(:create, :feature_flag, %{key: "beta", enabled: true})
```

This will print an audit log entry to the console.
