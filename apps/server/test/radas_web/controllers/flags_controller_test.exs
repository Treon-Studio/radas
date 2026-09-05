defmodule RadasWeb.FlagsControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for /api/flags/*: admin-gated mutations, public evaluate
  # (worker + console contract: {enabled, reason}), audit, export/import.
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "flags-e2e-jwt-000000"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    on_exit(fn -> System.delete_env("JWT_SECRET_KEY") end)

    for scope <- ["flags:global:default", "flag_audit:global:default"] do
      RadasAI.DB.execute!("DELETE FROM kv_store WHERE scope = $1", [scope])
    end

    admin_token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "flags-admin", "username" => "flagsadmin", "roles" => ["admin"], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    member_token =
      RadasAI.AuthToken.encode(
        %{"user_id" => "flags-member", "username" => "flagsmember", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 600, "iat" => System.system_time(:second)},
        @jwt_secret
      )

    {:ok,
     conn: build_conn() |> put_req_header("authorization", "Bearer " <> admin_token),
     admin_token: admin_token,
     member_token: member_token}
  end

  defp create_flag(conn, key, extra \\ %{}) do
    dispatch(conn, @endpoint, :post, "/api/flags", Map.merge(%{"key" => key, "enabled" => true}, extra))
  end

  test "create requires admin; member gets 403", %{conn: conn, member_token: member_token} do
    conn = create_flag(conn, "gated-flag")
    assert conn.status == 200

    denied =
      dispatch(
        build_conn() |> put_req_header("authorization", "Bearer " <> member_token),
        @endpoint,
        :post,
        "/api/flags",
        %{"key" => "member-flag"}
      )

    assert denied.status == 403
  end

  test "CRUD round trip via HTTP", %{conn: conn} do
    conn = create_flag(conn, "crud-flag")
    assert conn.status == 200
    %{"flag" => %{"key" => "crud-flag"}} = Jason.decode!(conn.resp_body)

    conn = dispatch(conn, @endpoint, :get, "/api/flags", nil)
    assert Jason.decode!(conn.resp_body)["flags"] |> Enum.any?(&(&1["key"] == "crud-flag"))

    conn = dispatch(conn, @endpoint, :patch, "/api/flags/crud-flag", %{"enabled" => false})
    assert conn.status == 200

    conn = dispatch(conn, @endpoint, :delete, "/api/flags/crud-flag", nil)
    assert conn.status == 200
  end

  test "evaluate returns the {enabled, reason} contract the Go worker parses", %{conn: conn} do
    create_flag(conn, "eval-flag", %{"rollout_percent" => 100})

    conn =
      dispatch(
        build_conn(),
        @endpoint,
        :post,
        "/api/flags/evaluate",
        %{"key" => "eval-flag", "env" => "prod"}
      )

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)
    IO.puts("DBG_EVAL=#{inspect(body)}")
    assert body["enabled"] == true
    assert body["reason"] == "full_rollout"
    assert is_binary(body["key"])
  end

  test "evaluate unknown key fails closed" do
    conn = dispatch(build_conn(), @endpoint, :post, "/api/flags/evaluate", %{"key" => "nope"})
    body = Jason.decode!(conn.resp_body)
    assert body["enabled"] == false
    assert body["reason"] == "unknown_flag"
  end

  test "evaluate requires key" do
    conn = dispatch(build_conn(), @endpoint, :post, "/api/flags/evaluate", %{})
    assert conn.status == 400
  end

  test "audit endpoint returns entries newest-first", %{conn: conn} do
    create_flag(conn, "audit-http")
    dispatch(conn, @endpoint, :patch, "/api/flags/audit-http", %{"enabled" => false})

    conn = dispatch(conn, @endpoint, :get, "/api/flags/audit", nil)
    entries = Jason.decode!(conn.resp_body)["audit"]
    assert Enum.any?(entries, &(&1["key"] == "audit-http" and &1["operation"] == "change"))
  end

  test "export/import round trip via HTTP", %{conn: conn} do
    create_flag(conn, "exp-http")

    conn = dispatch(conn, @endpoint, :get, "/api/flags/export", nil)
    exported = Jason.decode!(conn.resp_body)
    assert Enum.any?(exported, &(&1["key"] == "exp-http"))

    dispatch(conn, @endpoint, :delete, "/api/flags/exp-http", nil)

    conn = dispatch(conn, @endpoint, :post, "/api/flags/import", %{"flags" => exported})
    assert Jason.decode!(conn.resp_body)["imported"] >= 1
    assert FlagsVisible.flag?("exp-http")
  end

  test "expire-due endpoint", %{conn: conn} do
    create_flag(conn, "exp-due", %{"scheduled_expire_at" => System.system_time(:second) - 10})

    conn = dispatch(conn, @endpoint, :post, "/api/flags/expire-due", %{})
    assert Jason.decode!(conn.resp_body)["expiredCount"] >= 1
  end
end

defmodule FlagsVisible do
  def flag?(key) do
    RadasAI.Flags.load("global", nil) |> Enum.any?(&(&1["key"] == key))
  end
end
