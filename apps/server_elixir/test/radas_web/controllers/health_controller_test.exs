defmodule RadasWeb.HealthControllerTest do
  use ExUnit.Case, async: true

  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint

  test "GET /api/elixir/health returns ok" do
    conn =
      build_conn()
      |> get("/api/elixir/health")

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    assert body["status"] == "ok"
    assert body["service"] == "radas_elixir"
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
