defmodule RadasWeb.Plugs.AuthTest do
  use Radas.DataCase, async: false

  # Contract tests for the legacy require_auth port: internal-call bypass,
  # JWT + blacklist + readonly enforcement.
  import Plug.Conn
  import Plug.Test

  alias RadasAI.AuthService
  alias RadasWeb.Plugs.Auth

  @jwt_secret "authplug-e2e-jwt-000000"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    System.put_env("INTERNAL_CALL_SECRET", "internal-0000000000000000")
    tmp_dir = Path.join(System.tmp_dir!(), "radas-authplug-#{System.unique_integer()}")
    System.put_env("DATA_DIR", tmp_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("INTERNAL_CALL_SECRET")
      System.delete_env("DATA_DIR")
      File.rm_rf!(tmp_dir)
    end)

    {:ok, data_dir: tmp_dir}
  end

  defp run(conn), do: Auth.call(conn, [])

  test "missing token is denied 401 with the legacy error body" do
    conn = run(conn("GET", "/api/orgs"))
    assert conn.status == 401
    assert Jason.decode!(conn.resp_body)["error"] == "Access token missing"
  end

  test "valid JWT sets current_user claims" do
    conn =
      conn("GET", "/api/orgs")
      |> put_req_header("authorization", "Bearer " <> mint(%{"user_id" => "u1", "username" => "n", "roles" => []}))
      |> run()

    assert conn.halted == false
    assert conn.assigns[:current_user]["user_id"] == "u1"
  end

  test "blacklisted token is denied", %{data_dir: data_dir} do
    jwt = mint(%{"user_id" => "u1", "username" => "n", "roles" => []})
    AuthService.add_to_blacklist(data_dir, jwt)

    conn =
      conn("GET", "/api/orgs")
      |> put_req_header("authorization", "Bearer " <> jwt)
      |> run()

    assert conn.status == 401
    assert conn.halted
  end

  test "readonly role cannot mutate outside /api/auth" do
    conn =
      conn("POST", "/api/orgs")
      |> put_req_header("authorization", "Bearer " <> mint(%{"user_id" => "u1", "username" => "n", "roles" => ["readonly"]}))
      |> run()

    assert conn.status == 403
    assert Jason.decode!(conn.resp_body)["error"] =~ "read-only"

    # But GETs pass, and /api/auth paths are exempt.
    get_conn =
      conn("GET", "/api/orgs")
      |> put_req_header("authorization", "Bearer " <> mint(%{"user_id" => "u1", "username" => "n", "roles" => ["readonly"]}))
      |> run()

    assert get_conn.halted == false

    auth_conn =
      conn("POST", "/api/auth/logout")
      |> put_req_header("authorization", "Bearer " <> mint(%{"user_id" => "u1", "username" => "n", "roles" => ["readonly"]}))
      |> run()

    assert auth_conn.halted == false
  end

  test "internal-call header with the matching secret bypasses as admin" do
    conn =
      conn("POST", "/api/users")
      |> put_req_header("x-internal-call", "internal-0000000000000000")
      |> run()

    assert conn.halted == false
    user = conn.assigns[:current_user]
    assert user["username"] == "internal"
    assert "admin" in user["roles"]
  end

  test "wrong internal-call secret falls through to 401" do
    conn =
      conn("POST", "/api/users")
      |> put_req_header("x-internal-call", "wrong-secret")
      |> run()

    assert conn.status == 401
  end

  test "refresh tokens are rejected on access paths" do
    refresh =
      RadasAI.AuthToken.encode(
        %{"user_id" => "u", "username" => "n", "roles" => [], "token_type" => "refresh", "exp" => System.system_time(:second) + 300},
        @jwt_secret
      )

    conn =
      conn("GET", "/api/orgs")
      |> put_req_header("authorization", "Bearer " <> refresh)
      |> run()

    assert conn.status == 401
  end


  defp mint(claims) do
    RadasAI.AuthToken.encode(
      Map.merge(
        %{"token_type" => "access", "exp" => System.system_time(:second) + 300, "iat" => System.system_time(:second)},
        claims
      ),
      @jwt_secret
    )
  end
end
