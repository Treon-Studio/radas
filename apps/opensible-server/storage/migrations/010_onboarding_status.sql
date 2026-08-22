-- Onboarding status per user (UC397)
CREATE TABLE IF NOT EXISTS onboarding_status (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    completed_at REAL,
    created_at REAL DEFAULT (strftime('%s', 'now')),
    updated_at REAL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_status(user_id);