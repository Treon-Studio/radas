defmodule Radas.Repo.Migrations.AiRouterTablesV26ToV30 do
  @moduledoc """
  Creates the 9Router tables from schema versions 26-30 of
  `apps/server/storage/pg_schema.py` (see branch feat/console-v4-ai-router-clean).

  This mirrors the Python DDL byte-for-byte (PostgreSQL dialect, JSONB, DOUBLE
  PRECISION epoch timestamps) and marks versions 26-30 as applied in the shared
  `schema_migrations` table so the Python migration runner (on the 9Router
  branch) skips them as already applied. Ecto migrations for NEW schema start
  at version 31+.
  """

  use Ecto.Migration

  @versions [26, 27, 28, 29, 30]

  def up do
    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_provider_accounts (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        label TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 100,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_accounts UNIQUE (org_id, provider_name, label)
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_accounts_lookup ON org_ai_provider_accounts(org_id, provider_name, is_active, priority)")

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_endpoint_keys (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DOUBLE PRECISION NOT NULL,
        last_used_at DOUBLE PRECISION,
        CONSTRAINT uq_org_ai_endpoint_keys_prefix UNIQUE (org_id, key_prefix)
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_endpoint_keys_org ON org_ai_endpoint_keys(org_id, is_active)")

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_request_logs (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        user_id TEXT,
        endpoint TEXT NOT NULL,
        requested_model TEXT NOT NULL,
        resolved_provider TEXT,
        resolved_model TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        http_status INTEGER,
        latency_ms INTEGER,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        tokens_saved_rtk INTEGER NOT NULL DEFAULT 0,
        cost_usd_est DOUBLE PRECISION NOT NULL DEFAULT 0,
        fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
        stream BOOLEAN NOT NULL DEFAULT FALSE,
        request_id TEXT NOT NULL,
        attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at DOUBLE PRECISION NOT NULL
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_request_logs_org_time ON org_ai_request_logs(org_id, created_at DESC)")
    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_request_logs_request ON org_ai_request_logs(request_id)")

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_oauth_accounts (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        label TEXT NOT NULL,
        client_id TEXT NOT NULL DEFAULT '',
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        scope TEXT,
        status TEXT NOT NULL DEFAULT 'connected',
        expires_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_oauth_accounts UNIQUE (org_id, provider_name, label)
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_oauth_accounts_lookup ON org_ai_oauth_accounts(org_id, provider_name, status)")

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_proxy_pools (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        proxy_url_encrypted TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_proxy_pools UNIQUE (org_id, label)
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_proxy_pools_lookup ON org_ai_proxy_pools(org_id, is_active)")

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_responses (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        user_id TEXT,
        provider_name TEXT,
        model TEXT,
        input_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_json JSONB,
        output_text TEXT,
        previous_response_id TEXT,
        created_at DOUBLE PRECISION NOT NULL
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_ai_responses_org_time ON org_ai_responses(org_id, created_at DESC)")

    for version <- @versions do
      execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (#{version}, #{System.system_time(:second)}) ON CONFLICT DO NOTHING"
      )
    end
  end

  def down do
    for table <- ~w(org_ai_responses org_ai_proxy_pools org_ai_oauth_accounts org_ai_request_logs org_ai_endpoint_keys org_ai_provider_accounts) do
      execute("DROP TABLE IF EXISTS #{table}")
    end

    for version <- Enum.reverse(@versions) do
      execute("DELETE FROM schema_migrations WHERE version = #{version}")
    end
  end
end
