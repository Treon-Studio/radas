defmodule RadasWeb.Plugs.PlatformContractTest do
  use ExUnit.Case, async: true

  import Plug.Conn
  import Plug.Test

  alias RadasWeb.Plugs.PlatformContract

  defp run(method, path, opts \\ []) do
    conn =
      conn(method, path)
      |> maybe_put_request_id(opts[:request_id])
      |> PlatformContract.call([])

    status = opts[:status] || 200

    body =
      # Simulate a controller that builds its body with the authoritative
      # request id (like one calling Radas.Envelope.success/2).
      opts[:body] ||
        Jason.encode!(Radas.Envelope.success(%{"ok" => true}, Radas.RequestID.current(conn)))

    send_resp(conn, status, body)
  end

  defp maybe_put_request_id(conn, nil), do: conn

  defp maybe_put_request_id(conn, request_id) do
    put_req_header(conn, "x-request-id", request_id)
  end

  describe "platform_request?" do
    test "platform namespace paths" do
      assert PlatformContract.platform_request?("/api/platform")
      assert PlatformContract.platform_request?("/api/platform/operations/op-1")
      assert PlatformContract.platform_request?("/api/v2")
      assert PlatformContract.platform_request?("/api/v2/services")
    end

    test "legacy mirrors stay outside the contract" do
      refute PlatformContract.platform_request?("/api/platform/idempotency")
      refute PlatformContract.platform_request?("/api/v2/platform/idempotency")
    end

    test "service routes match prefix or full" do
      assert PlatformContract.platform_request?("/api/projects/p-1/services")
      assert PlatformContract.platform_request?("/api/projects/p-1/services/deploy")
      refute PlatformContract.platform_request?("/api/projects/p-1/other")
    end

    test "bootstrap probe namespace behaves like platform" do
      assert PlatformContract.platform_request?("/api/elixir/health")
      assert PlatformContract.platform_request?("/api/elixir/echo")
    end

    test "legacy API paths stay outside" do
      refute PlatformContract.platform_request?("/api/auth/login")
      refute PlatformContract.platform_request?("/api/worker/claim")
      refute PlatformContract.platform_request?("/healthz")
    end
  end

  describe "request id" do
    test "stamps X-Request-ID header equal to body request_id" do
      conn = run("GET", "/api/platform/things")
      [header] = get_resp_header(conn, "x-request-id")
      body = Jason.decode!(conn.resp_body)
      assert body["request_id"] == header
    end

    test "reuses a valid client request id" do
      conn = run("GET", "/api/platform/things", request_id: "req-client-1")
      assert get_resp_header(conn, "x-request-id") == ["req-client-1"]
      assert Jason.decode!(conn.resp_body)["request_id"] == "req-client-1"
    end

    test "does not stamp legacy namespace" do
      conn = run("GET", "/api/auth/login")
      assert get_resp_header(conn, "x-request-id") == []
    end
  end

  describe "error normalization" do
    test "4xx non-envelope bodies become error envelopes" do
      conn = run("POST", "/api/v2/things", status: 422, body: Jason.encode!(%{"message" => "nope"}))
      body = Jason.decode!(conn.resp_body)

      assert body["error"]["code"] == "VALIDATION_ERROR"
      assert body["error"]["message"] == "nope"
      assert body["error"]["details"] == %{}
      [header] = get_resp_header(conn, "x-request-id")
      assert body["request_id"] == header
      assert conn.status == 422
    end

    test ">= 500 becomes a generic internal error" do
      conn = run("GET", "/api/platform/things", status: 500, body: Jason.encode!(%{"message" => "boom secret=abc"}))
      body = Jason.decode!(conn.resp_body)

      assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
      assert body["error"]["message"] == "Internal server error"
    end

    test "existing error envelopes keep their code but gain request_id and redaction" do
      existing =
        Jason.encode!(%{
          "error" => %{"code" => "CONFLICT", "message" => "taken", "details" => %{"api_key" => "raw"}}
        })

      conn = run("POST", "/api/platform/things", status: 409, body: existing)
      body = Jason.decode!(conn.resp_body)

      assert body["error"]["code"] == "CONFLICT"
      assert body["error"]["message"] == "taken"
      assert body["error"]["details"] == %{"api_key" => "[REDACTED]"}
      [header] = get_resp_header(conn, "x-request-id")
      assert body["request_id"] == header
    end

    test "bodies without a message use the default text" do
      conn = run("GET", "/api/platform/missing", status: 404, body: Jason.encode!(%{"errors" => "not found"}))
      body = Jason.decode!(conn.resp_body)

      assert body["error"]["code"] == "NOT_FOUND"
      assert body["error"]["message"] == "Request failed"
    end

    test "success responses are not rewritten" do
      conn =
        run("GET", "/api/platform/things",
          status: 200,
          body: Jason.encode!(%{"data" => %{"ok" => true}})
        )

      body = Jason.decode!(conn.resp_body)

      # The finalizer never rewrites success bodies (controllers own them);
      # it only stamps the correlation header.
      assert body["data"] == %{"ok" => true}
      assert get_resp_header(conn, "x-request-id") != []
    end
  end
end
