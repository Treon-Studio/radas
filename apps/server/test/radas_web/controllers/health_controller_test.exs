defmodule RadasWeb.HealthControllerTest do
  use Radas.DataCase, async: false

  setup do
    for {key, value} <- [
          {"JWT_SECRET_KEY", "health-test-jwt-secret"},
          {"INTERNAL_CALL_SECRET", "health-test-internal-secret"},
          {"GLOBAL_SECRETS_ENCRYPTION_KEY", "health-test-encryption-key"}
        ] do
      System.put_env(key, value)
    end

    :ok
  end

  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint

  test "GET /api/healthz returns ok" do
    conn =
      build_conn()
      |> get("/api/healthz")

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert body["status"] == "ok"
    assert body["service"] == "radas"
  end

  test "GET /api/readyz returns dependency readiness" do
    conn = build_conn() |> get("/api/readyz")

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert body["data"]["status"] == "ready"
    assert body["data"]["service"] == "radas"
    [header] = get_resp_header(conn, "x-request-id")
    assert body["request_id"] == header
  end

  test "GET /api/readyz reports incomplete migrations safely" do
    Radas.Repo.query!("DELETE FROM ecto_migrations")
    conn = build_conn() |> get("/api/readyz")

    assert conn.status == 503
    body = Jason.decode!(conn.resp_body)
    assert body["error"]["code"] == "MIGRATIONS_INCOMPLETE"
    refute Jason.encode!(body) =~ "postgres"
    assert body["request_id"]
    [header] = get_resp_header(conn, "x-request-id")
    assert body["request_id"] == header
  end

  test "GET /api/health remains the legacy lightweight probe" do
    conn = build_conn() |> get("/api/health")

    assert conn.status == 200
    assert Jason.decode!(conn.resp_body) == %{"success" => true, "status" => "ok"}
  end

  test "unmatched platform paths get the error envelope treatment" do
    conn =
      build_conn()
      |> get("/api/v2/does-not-exist")

    # Phoenix renders its own 404 JSON; the platform finalizer normalizes it.
    assert conn.status == 404
    body = Jason.decode!(conn.resp_body)
    assert body["error"]["code"] == "NOT_FOUND"
    assert Map.has_key?(body, "request_id")
    [header] = get_resp_header(conn, "x-request-id")
    assert body["request_id"] == header
  end

  test "legacy unmatched paths keep Phoenix's default 404 body" do
    conn =
      build_conn()
      |> get("/api/auth/does-not-exist")

    assert conn.status == 404
    body = Jason.decode!(conn.resp_body)
    assert body["request_id"] == nil
    assert get_resp_header(conn, "x-request-id") == []
  end
end
