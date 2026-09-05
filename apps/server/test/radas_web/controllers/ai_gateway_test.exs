defmodule RadasWeb.AIGatewayTest do
  use Radas.DataCase, async: false

  # End-to-end tests for the /api/v1 gateway + management surface against the
  # shared PostgreSQL schema. Provider calls are not made here: the pipeline's
  # testing mode synthesizes a completion when no credentials are configured
  # (mirroring the Python FLASK_ENV=testing branch).
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @org "org-gateway-e2e"
  @jwt_secret "gateway-e2e-jwt-secret-000000"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", "gateway-e2e-enc-key-000000")
    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY")
    end)

    RadasAI.DB.execute!("INSERT INTO orgs (id, name, created_at) VALUES ($1, 'GW', 0) ON CONFLICT (id) DO NOTHING", [@org])

    user_id = "gw-user-1"
    RadasAI.DB.execute!("DELETE FROM org_members WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_provider_accounts WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_providers WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_routes WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_request_logs WHERE org_id = $1", [@org])
    RadasAI.DB.execute!("DELETE FROM org_ai_endpoint_keys WHERE org_id = $1", [@org])

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
      [@org, user_id]
    )

    token = RadasAI.AuthToken.encode(%{"user_id" => user_id, "username" => "gw", "roles" => ["owner"], "token_type" => "access", "exp" => System.system_time(:second) + 600, "org_id" => @org}, @jwt_secret)

    {:ok, conn: build_conn() |> put_req_header("authorization", "Bearer " <> token), org: @org}
  end

  test "chat completions synthesize in testing mode with fallback chain + telemetry", %{conn: conn} do
    conn =
      conn
      |> post("/api/v1/chat/completions", %{
        "model" => "unknown-model-xyz",
        "messages" => [%{"role" => "user", "content" => "hi"}]
      })

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert body["choices"] |> hd() |> get_in(["message", "content"]) == "Test gateway response"
    assert body["usage"]["rtk_tokens_saved"] == 0
    # A non-null request id comes back through the headers.
    [request_id] = get_resp_header(conn, "x-9router-request-id")
    assert String.starts_with?(request_id, "req-")

    # Telemetry recorded the synthesized attempt.
    assert [_row] = RadasAI.Telemetry.list_request_logs(@org)
  end

  test "endpoint keys authenticate the gateway and pin the org", %{org: org} do
    created = RadasAI.EndpointKeys.create_key(org, "e2e")

    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> created["key"])
      |> post("/api/v1/chat/completions", %{
        "model" => "m",
        "messages" => [%{"role" => "user", "content" => "hi"}]
      })

    assert conn.status == 200
    assert (conn.assigns[:current_user] || %{})["org_id"] == org
  end

  test "invalid endpoint key is rejected with OpenAI-style auth error" do
    conn =
      build_conn()
      |> put_req_header("authorization", "Bearer radas_epk_bogus")
      |> post("/api/v1/chat/completions", %{"model" => "m", "messages" => [%{"role" => "user", "content" => "hi"}]})

    assert conn.status == 401
    body = Jason.decode!(conn.resp_body)
    assert body["error"]["type"] == "authentication_error"
  end

  test "missing/invalid JWT is rejected" do
    conn = build_conn() |> get("/api/v1/models")
    assert conn.status == 401
  end

  test "models lists configured providers and combos", %{conn: conn, org: org} do
    RadasAI.DB.execute!(
      "INSERT INTO org_ai_providers (id, org_id, provider_name, api_key_encrypted, base_url, is_active, rate_limit_per_min, created_at, updated_at) VALUES ('p1', $1, 'deepseek', 'enc', '', TRUE, 60, 0, 0)",
      [org]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_ai_routes (id, org_id, alias_name, primary_model, fallback_models, rtk_compression_enabled, caveman_mode, created_at) VALUES ('r1', $1, 'fast', 'deepseek-chat', '[\"gpt-4o-mini\"]', TRUE, 'off', 0)",
      [org]
    )

    conn = get(conn, "/api/v1/models")
    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    ids = Enum.map(body["data"], & &1["id"])
    assert "deepseek" in ids
    assert "fast" in ids
  end

  test "management: providers CRUD requires owner/admin for mutation", %{conn: conn, org: org} do
    conn = conn |> post("/api/orgs/#{org}/ai/providers", %{"provider_name" => "openai", "api_key" => "sk-x", "rate_limit_per_min" => 30})
    assert conn.status == 200
    %{"id" => provider_id} = Jason.decode!(conn.resp_body)

    conn = conn |> get("/api/orgs/#{org}/ai/providers")
    assert conn.status == 200
    assert [_row] = Jason.decode!(conn.resp_body)["providers"]

    conn = conn |> patch("/api/orgs/#{org}/ai/providers/#{provider_id}", %{"is_active" => false})
    assert conn.status == 200

    conn = conn |> delete("/api/orgs/#{org}/ai/providers/#{provider_id}")
    assert conn.status == 200
  end

  test "management: logs endpoint validates status filter", %{conn: conn, org: org} do
    conn = conn |> get("/api/orgs/#{org}/ai/logs", %{"status" => "bogus"})
    assert conn.status == 400
  end

  test "management: endpoint keys round trip", %{conn: conn, org: org} do
    conn = conn |> post("/api/orgs/#{org}/ai/endpoint-keys", %{"label" => "cli"})
    assert conn.status == 200
    %{"id" => key_id} = Jason.decode!(conn.resp_body)

    conn = conn |> get("/api/orgs/#{org}/ai/endpoint-keys")
    assert [%{"id" => ^key_id}] = Jason.decode!(conn.resp_body)["keys"]

    conn = conn |> delete("/api/orgs/#{org}/ai/endpoint-keys/#{key_id}")
    assert conn.status == 200
  end
end
