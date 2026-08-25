-- Project locks table for project-level concurrency control
CREATE TABLE IF NOT EXISTS project_locks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor TEXT,
    operation TEXT NOT NULL,
    run_id TEXT,
    acquired_at REAL NOT NULL,
    expires_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_locks_project_expires ON project_locks(project_id, expires_at);