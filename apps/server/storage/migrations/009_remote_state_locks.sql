-- Remote state locks for cross-worker concurrency control (UC331)
CREATE TABLE IF NOT EXISTS remote_state_locks (
    id TEXT PRIMARY KEY,
    stack TEXT NOT NULL,
    backend_type TEXT NOT NULL, -- 's3', 'oss', 'local'
    backend_key TEXT NOT NULL,  -- bucket/key/path
    actor TEXT,
    operation TEXT NOT NULL,
    run_id TEXT,
    acquired_at REAL NOT NULL,
    expires_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_remote_state_locks_stack_backend ON remote_state_locks(stack, backend_type, backend_key);
CREATE INDEX IF NOT EXISTS idx_remote_state_locks_expires ON remote_state_locks(expires_at);