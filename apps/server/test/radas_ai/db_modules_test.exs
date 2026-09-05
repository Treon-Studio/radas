defmodule RadasAI.DBModulesTest do
  use Radas.DataCase, async: false

  # Tests for the DB-backed AI-router modules against the shared PostgreSQL
  # schema (Python-managed tables V26-V30, created by the 20260904000001
  # Ecto migration). Org FK target is seeded per test.
  alias RadasAI.{Accounts, EndpointKeys, OAuth, ProxyPools, ResponseStore, Telemetry}

  @key "dbmodules-test-key-1234567890"
  @org "org-elixir-test"

  setup do
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", @key)
    on_exit(fn -> System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY") end)

    RadasAI.DB.execute!("""
      INSERT INTO orgs (id, name, created_at) VALUES ($1, 'Elixir Test Org', 0)
      ON CONFLICT (id) DO NOTHING
    """, [@org])

    RadasAI.DB.execute!("DELETE FROM org_ai_endpoint_keys WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_provider_accounts WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_providers WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_request_logs WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_responses WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_proxy_pools WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_oauth_accounts WHERE org_id = $1", [@org])

    {:ok, org: @org}
  end

  # -- EndpointKeys ----------------------------------------------------------

  test "create_key shows the raw key exactly once and lookup resolves by hash", %{org: org} do
    created = EndpointKeys.create_key(org, "ci-key")
    assert String.starts_with?(created["key"], "radas_epk_")
    assert created["key_prefix"] == String.slice(created["key"], 0, 14)

    # Metadata never contains the raw key or hash.
    [meta] = EndpointKeys.list_keys(org)
    assert meta["id"] == created["id"]
    refute Map.has_key?(meta, "key_hash")
    refute meta["key_prefix"] == created["key"]

    entry = EndpointKeys.lookup(created["key"])
    assert entry["org_id"] == org
    assert entry["id"] == created["id"]
    assert entry["is_active"] == true

    assert EndpointKeys.lookup("radas_epk_wrong") == nil
    assert EndpointKeys.lookup("not-a-key") == nil
  end

  test "revoke deactivates lookup and deleting is org-scoped", %{org: org} do
    created = EndpointKeys.create_key(org)
    assert EndpointKeys.revoke(org, created["id"])
    assert EndpointKeys.lookup(created["key"]) == nil
    refute EndpointKeys.revoke("org-other", created["id"])
  end

  test "touch records last_used_at and never raises", %{org: org} do
    created = EndpointKeys.create_key(org)
    assert EndpointKeys.touch(created["id"]) == :ok
    [meta] = EndpointKeys.list_keys(org)
    assert meta["last_used_at"] != nil
    # Touching a nonexistent key must not raise.
    assert EndpointKeys.touch("epk-nope") == :ok
  end

  # -- Accounts ----------------------------------------------------------------

  test "rotate round-robins equal-priority leaders only", %{org: org} do
    for i <- 0..2 do
      RadasAI.DB.execute!(
        "INSERT INTO org_ai_provider_accounts (id, org_id, provider_name, label, api_key_encrypted, base_url, priority, is_active, created_at, updated_at) " <>
          "VALUES ($1, $2, 'openai', $3, $4, '', 100, TRUE, $5, $5)",
        ["acct-#{i}", org, "acct-#{i}", RadasAI.SecretEncryption.encrypt("sk-#{i}"), RadasAI.DB.now()]
      )
    end

    RadasAI.DB.execute!(
      "INSERT INTO org_ai_provider_accounts (id, org_id, provider_name, label, api_key_encrypted, base_url, priority, is_active, created_at, updated_at) " <>
        "VALUES ('acct-low', $1, 'openai', 'low', $2, '', 200, TRUE, $3, $3)",
      [org, RadasAI.SecretEncryption.encrypt("sk-low"), RadasAI.DB.now()]
    )

    rows = Accounts.list_accounts(org, "openai")
    assert length(rows) == 4
    assert hd(rows)["priority"] == 100

    # 4 rotations over 3 leaders: every leader appears first exactly once or twice,
    # and the low-priority account is always last.
    labels =
      for _ <- 1..4 do
        rotated = Accounts.rotate(rows, org, "openai")
        assert List.last(rotated)["label"] == "low"
        hd(rotated)["label"]
      end

    assert Enum.uniq(labels) |> length() == 3
  end

  test "gather_credentials resolves accounts then vault then env", %{org: org} do
    # 1. No credentials anywhere but env var set.
    System.put_env("ELIXIR_TEST_PROVIDER_KEY", "sk-from-env")
    assert [%{"api_key" => "sk-from-env"}] = Accounts.gather_credentials(org, "deepseek", "ELIXIR_TEST_PROVIDER_KEY")

    # 2. Vault default key ranks above env.
    RadasAI.DB.execute!(
      "INSERT INTO org_ai_providers (id, org_id, provider_name, api_key_encrypted, base_url, is_active, rate_limit_per_min, created_at, updated_at) " <>
        "VALUES ('prov-1', $1, 'deepseek', $2, '', TRUE, 60, $3, $3)",
      [org, RadasAI.SecretEncryption.encrypt("sk-vault"), RadasAI.DB.now()]
    )

    [%{"api_key" => "sk-vault"}] = Accounts.gather_credentials(org, "deepseek", "ELIXIR_TEST_PROVIDER_KEY")

    # 3. Accounts rank above vault.
    RadasAI.DB.execute!(
      "INSERT INTO org_ai_provider_accounts (id, org_id, provider_name, label, api_key_encrypted, base_url, priority, is_active, created_at, updated_at) " <>
        "VALUES ('acct-main', $1, 'deepseek', 'main', $2, 'https://relay.example/v1', 100, TRUE, $3, $3)",
      [org, RadasAI.SecretEncryption.encrypt("sk-account"), RadasAI.DB.now()]
    )

    creds = Accounts.gather_credentials(org, "deepseek", "ELIXIR_TEST_PROVIDER_KEY")
    assert [%{"api_key" => "sk-account", "base_url" => "https://relay.example/v1"}] = creds
  end

  # -- Telemetry ----------------------------------------------------------------

  test "record_request_log persists a redacted row and cost summary aggregates", %{org: org} do
    Telemetry.record_request_log(
      org_id: org,
      user_id: "user-1",
      endpoint: "chat",
      requested_model: "claude-3-5-sonnet",
      attempts: [%{"provider" => "anthropic", "model" => "claude-3-5-sonnet", "status" => "success"}],
      status: "success",
      request_id: "req-tel-1",
      resolved_provider: "anthropic",
      resolved_model: "claude-3-5-sonnet",
      latency_ms: 123,
      prompt_tokens: 100,
      completion_tokens: 50
    )

    [row] = Telemetry.list_request_logs(org)
    assert row["status"] == "success"
    assert row["prompt_tokens"] == 100
    assert row["completion_tokens"] == 50
    assert row["latency_ms"] == 123
    assert row["fallback_used"] == false
    # attempts JSONB decoded
    assert hd(row["attempts"])["provider"] == "anthropic"

    summary = Telemetry.cost_summary(org)
    assert summary["total_requests"] == 1
    assert summary["total_prompt_tokens"] == 100
    assert summary["total_completion_tokens"] == 50
    # claude-3-5-sonnet: 100/1M*3.00 + 50/1M*15.00 = 0.00105
    assert_in_delta summary["total_cost_usd_est"], 0.00105, 0.0000001
    assert summary["note"] =~ "not billing data"
  end

  test "list_request_logs filters by status and date range", %{org: org} do
    now = RadasAI.DB.now()

    for i <- 0..2 do
      Telemetry.record_request_log(
        org_id: org,
        endpoint: "chat",
        requested_model: "m",
        attempts: [],
        status: if(rem(i, 2) == 0, do: "success", else: "error"),
        request_id: "req-f#{i}",
        created_at: now - i * 10
      )
    end

    assert length(Telemetry.list_request_logs(org, status: "success")) == 2
    assert length(Telemetry.list_request_logs(org, status: "error")) == 1
    assert length(Telemetry.list_request_logs(org, since: now - 15)) == 2
    assert length(Telemetry.list_request_logs(org, limit: 2)) == 2
  end

  test "telemetry never fails a request on persistence errors" do
    # Invalid FK org: the rescue path must swallow it.
    assert Telemetry.record_request_log(
             org_id: "org-does-not-exist",
             endpoint: "chat",
             requested_model: "m",
             attempts: [],
             status: "success",
             request_id: "req-bad"
           ) == :ok
  end

  # -- ResponseStore ------------------------------------------------------------

  test "response chain replay is depth-capped and cycle-safe", %{org: org} do
    id0 = ResponseStore.store_response(org_id: org, user_id: "u", provider_name: "openai", model: "gpt-4o", input_messages: [%{"role" => "user", "content" => "q0"}], output_text: "a0")

    id1 =
      ResponseStore.store_response(
        org_id: org,
        user_id: "u",
        provider_name: "openai",
        model: "gpt-4o",
        input_messages: [%{"role" => "user", "content" => "q1"}],
        output_text: "a1",
        previous_response_id: id0
      )

    # Cycle: point id0 back at id1.
    RadasAI.DB.execute!("UPDATE org_ai_responses SET previous_response_id = $1 WHERE id = $2", [id1, id0])

    messages = ResponseStore.build_context_messages(org, id1)
    contents = Enum.map(messages, & &1["content"])
    assert contents == ["q1", "a1", "q0", "a0"]

    assert ResponseStore.get_response(org, id1)["previous_response_id"] == id0
    assert ResponseStore.get_response("org-other", id1) == nil
  end

  # -- ProxyPools -----------------------------------------------------------------

  test "upsert, list, delete, and rotation of proxy pools", %{org: org} do
    assert_raise ProxyPools.ProxyPoolError, ~r/http\(s\)/, fn ->
      ProxyPools.upsert_pool(org, "p1", "ftp://not-a-proxy")
    end

    ProxyPools.upsert_pool(org, "p1", "http://proxy-a:3128")
    ProxyPools.upsert_pool(org, "p2", "https://proxy-b:3129")
    # Re-upsert updates in place.
    ProxyPools.upsert_pool(org, "p1", "http://proxy-a2:3128")

    pools = ProxyPools.list_pools(org)
    assert length(pools) == 2
    assert Enum.map(pools, & &1["label"]) |> Enum.sort() == ["p1", "p2"]

    # Rotation across both pools.
    urls = for _ <- 1..4, do: ProxyPools.resolve_proxy_url(org)
    assert Enum.uniq(urls) |> length() == 2
    assert "http://proxy-a2:3128" in urls

    assert ProxyPools.delete_pool(org, hd(pools)["id"])
    refute ProxyPools.delete_pool(org, "pool-nope")
  end

  # -- OAuth -----------------------------------------------------------------------

  test "import_token encrypts and lists redacted metadata; revoke deletes", %{org: org} do
    account = OAuth.import_token(org, "cursor", label: "operator", access_token: "tok-secret-42", expires_in: 7200)

    assert account["status"] == "connected"
    accounts = OAuth.list_accounts(org)
    [meta] = accounts
    assert meta["provider_name"] == "cursor"
    assert meta["label"] == "operator"
    # No token material anywhere in the metadata.
    refute String.contains?(Jason.encode!(meta), "tok-secret-42")

    # Underlying token is decryptable with the org's key.
    [row] = RadasAI.DB.query_all!("SELECT access_token_encrypted FROM org_ai_oauth_accounts WHERE org_id = $1", [org])
    assert RadasAI.SecretEncryption.decrypt(row["access_token_encrypted"]) == "tok-secret-42"

    assert OAuth.revoke(org, account["id"])
    assert OAuth.list_accounts(org) == []
  end

  test "import_token rejects unknown providers and oversized tokens", %{org: org} do
    assert_raise OAuth.OAuthError, ~r/Unknown OAuth provider/, fn ->
      OAuth.import_token(org, "not-a-provider", label: "x", access_token: "tok")
    end

    assert_raise OAuth.OAuthError, ~r/access_token is required/, fn ->
      OAuth.import_token(org, "cursor", label: "x", access_token: String.duplicate("a", 9000))
    end
  end

  test "gateway-to-oauth mapping covers the four gateway providers" do
    assert OAuth.oauth_provider_name("anthropic") == "claude"
    assert OAuth.oauth_provider_name("openai") == "codex"
    assert OAuth.oauth_provider_name("github") == "github"
    assert OAuth.oauth_provider_name("google") == "gemini-cli"
    assert OAuth.oauth_provider_name("mistral") == nil
  end

  test "device flow rejects unsupported providers" do
    assert_raise OAuth.OAuthError, ~r/does not support the device flow/, fn ->
      OAuth.begin_device_flow(@org, "cursor", "x")
    end
  end

  test "all 24 upstream providers are covered", %{org: _org} do
    names = OAuth.all_oauth_provider_names()
    assert length(names) == 17
    assert "claude" in names
    assert "kimi" in names
    assert "cursor" in names
    assert "codebuddy-intl" in names
  end
end
