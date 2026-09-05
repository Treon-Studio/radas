defmodule RadasWeb.AuthControllerTest do
  use Radas.DataCase, async: false

  # Contract tests for the legacy /api/auth/* surface, pinned against
  # contracts/cross-client-fixtures.json (login step).
  import Phoenix.ConnTest
  import Plug.Conn

  @endpoint RadasWeb.Endpoint
  @jwt_secret "auth-e2e-jwt-secret-000000"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    tmp_data_dir = Path.join(System.tmp_dir!(), "radas-auth-test-#{System.unique_integer()}")
    System.put_env("DATA_DIR", tmp_data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(tmp_data_dir)
    end)

    RadasAI.DB.execute!(
      """
      INSERT INTO orgs (id, name, created_at) VALUES ($1, 'Auth Org', 0)
      ON CONFLICT (id) DO NOTHING
      """,
      ["org-auth-e2e"]
    )

    RadasAI.DB.execute!("DELETE FROM org_members WHERE org_id = 'org-auth-e2e' AND user_id = 'user-auth-e2e'", [])
    RadasAI.DB.execute!("DELETE FROM users WHERE id = 'user-auth-e2e'", [])

    password_hash = RadasAI.AuthService.hash_password("correct-horse-battery")

    RadasAI.DB.execute!(
      """
      INSERT INTO users (id, username, email, password_hash, is_active, created_at, updated_at)
      VALUES ('user-auth-e2e', 'authuser', 'auth@example.com', $1, 1, $2, $2)
      """,
      [password_hash, RadasAI.DB.now() |> Float.to_string()]
    )

    RadasAI.DB.execute!(
      "INSERT INTO org_members (org_id, user_id, role) VALUES ('org-auth-e2e', 'user-auth-e2e', 'owner') ON CONFLICT DO NOTHING",
      []
    )

    {:ok, conn: build_conn(), data_dir: tmp_data_dir}
  end

  test "login returns the flat legacy shape with orgs and user", %{conn: conn} do
    conn =
      conn
      |> post("/api/auth/login", %{"username" => "authuser", "password" => "correct-horse-battery"})

    assert conn.status == 200
    body = Jason.decode!(conn.resp_body)

    assert body["success"] == true
    assert is_binary(body["access_token"])
    assert is_binary(body["refresh_token"])
    assert body["active_org_id"] == "org-auth-e2e"
    assert body["orgs"] |> hd() |> Map.fetch!("id") == "org-auth-e2e"
    assert body["user"] == %{"id" => "user-auth-e2e", "username" => "authuser", "email" => "auth@example.com", "roles" => []}

    # Tokens carry the same claims Python mints (org context included).
    {:ok, claims} = RadasAI.AuthToken.verify(body["access_token"], @jwt_secret)
    assert claims["user_id"] == "user-auth-e2e"
    assert claims["org_id"] == "org-auth-e2e"
    assert claims["token_type"] == "access"
  end

  test "login failure is a flat {success, error} body with 401 — never the envelope", %{conn: conn} do
    conn = conn |> post("/api/auth/login", %{"username" => "authuser", "password" => "wrong"})

    assert conn.status == 401
    body = Jason.decode!(conn.resp_body)
    assert body == %{"success" => false, "error" => "Incorrect username or password"}
  end

  test "login missing password returns 400" do
    conn = build_conn() |> post("/api/auth/login", %{"username" => "authuser"})
    assert conn.status == 400
    assert Jason.decode!(conn.resp_body)["error"] == "Password is required"
  end

  test "refresh rotates tokens and blacklists the presented one", %{conn: conn, data_dir: data_dir} do
    conn = conn |> post("/api/auth/login", %{"username" => "authuser", "password" => "correct-horse-battery"})
    body = Jason.decode!(conn.resp_body)

    conn2 =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> body["refresh_token"])
      |> post("/api/auth/refresh", %{})

    assert conn2.status == 200
    refresh_body = Jason.decode!(conn2.resp_body)
    assert refresh_body["success"] == true
    assert is_binary(refresh_body["access_token"])
    refute refresh_body["refresh_token"] == body["refresh_token"]

    # The presented refresh token is now blacklisted (file shared with Flask).
    assert RadasAI.AuthService.blacklisted?(data_dir, body["refresh_token"])
  end

  test "logout blacklists the presented token", %{conn: conn, data_dir: data_dir} do
    conn = conn |> post("/api/auth/login", %{"username" => "authuser", "password" => "correct-horse-battery"})
    %{"access_token" => access_token} = Jason.decode!(conn.resp_body)

    refute RadasAI.AuthService.blacklisted?(data_dir, access_token)

    conn2 = build_conn() |> put_req_header("authorization", "Bearer " <> access_token) |> post("/api/auth/logout", %{})
    assert conn2.status == 200
    assert Jason.decode!(conn2.resp_body)["success"] == true
    assert RadasAI.AuthService.blacklisted?(data_dir, access_token)
  end

  test "Python-minted tokens verify through the same AuthToken path", %{conn: _conn} do
    token = RadasAI.AuthToken.encode(%{"user_id" => "u", "username" => "n", "roles" => [], "token_type" => "access", "exp" => System.system_time(:second) + 60, "iat" => System.system_time(:second)}, @jwt_secret)
    claims = RadasAI.AuthService.verify_token(token, "unused-data-dir", "access")
    assert claims["user_id"] == "u"
  end
end
