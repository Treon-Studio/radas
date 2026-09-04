defmodule RadasWeb.Plugs.CorsTest do
  use ExUnit.Case, async: true

  import Plug.Conn
  import Plug.Test

  alias RadasWeb.Plugs.Cors

  setup do
    System.put_env("CORS_ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080")
    on_exit(fn -> System.delete_env("CORS_ALLOWED_ORIGINS") end)
    :ok
  end

  defp preflight(path, origin, extra_headers \\ []) do
    headers =
      Enum.map(extra_headers, fn {k, v} -> {to_string(k), v} end)

    conn("OPTIONS", path)
    |> maybe_origin(origin)
    |> then(fn conn ->
      Enum.reduce(headers, conn, fn {k, v}, acc -> put_req_header(acc, k, v) end)
    end)
    |> Cors.call([])
  end

  defp maybe_origin(conn, nil), do: conn

  defp maybe_origin(conn, origin) do
    put_req_header(conn, "origin", origin)
  end

  defp get_req(conn, name), do: get_resp_header(conn, name) |> List.first()

  test "preflight short-circuits with 204 and echoes requested headers" do
    conn =
      preflight("/api/platform/things", "http://localhost:8080",
        "access-control-request-headers": "Content-Type, X-Project-Id"
      )
    assert conn.halted
    assert conn.status == 204
    assert get_req(conn, "access-control-allow-origin") == "http://localhost:8080"
    assert get_req(conn, "access-control-allow-credentials") == "true"
    assert get_req(conn, "access-control-allow-headers") == "Content-Type, X-Project-Id"
    assert get_req(conn, "access-control-allow-methods") == "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    assert get_req(conn, "vary") == "Origin"
  end

  test "preflight without requested headers uses the default list" do
    conn = preflight("/api/platform/things", "http://localhost:8080")
    assert get_req(conn, "access-control-allow-headers") == Enum.join(Cors.default_allow_headers(), ", ")
  end

  test "preflight from a non-allowlisted origin gets method/headers but no origin grant" do
    conn = preflight("/api/platform/things", "http://evil.example")
    assert conn.status == 204
    assert get_resp_header(conn, "access-control-allow-origin") == []
    assert get_resp_header(conn, "access-control-allow-credentials") == []
  end

  test "non-preflight API requests get origin headers when allowlisted" do
    conn =
      conn("GET", "/api/platform/things")
      |> put_req_header("origin", "http://127.0.0.1:8080")
      |> Cors.call([])

    refute conn.halted
    assert get_resp_header(conn, "access-control-allow-origin") == ["http://127.0.0.1:8080"]
    assert get_resp_header(conn, "access-control-allow-credentials") == ["true"]
    assert get_resp_header(conn, "vary") == ["Origin"]
  end

  test "non-API paths are untouched" do
    conn =
      conn("GET", "/healthz")
      |> put_req_header("origin", "http://localhost:8080")
      |> Cors.call([])

    assert get_resp_header(conn, "access-control-allow-origin") == []
  end

  test "allowed_origins falls back to defaults when env unset" do
    System.delete_env("CORS_ALLOWED_ORIGINS")
    assert "http://localhost:8080" in Cors.allowed_origins()
    assert "http://0.0.0.0:8080" in Cors.allowed_origins()
  end
end
