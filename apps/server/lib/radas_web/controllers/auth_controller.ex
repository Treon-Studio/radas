defmodule RadasWeb.AuthController do
  @moduledoc """
  Port of `api/auth_routes.py` core: /api/auth/login, /refresh, /logout.

  The legacy auth namespace returns FLAT bodies — `{success: true, ...}` and
  `{success: false, error}` — never the platform error envelope (pinned by
  contracts/cross-client-fixtures.json).
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.AuthService

  @max_attempts 10
  @window_seconds 300

  # -- login ------------------------------------------------------------------

  def login(conn, _params) do
    data = conn.body_params || %{}
    username = String.trim(to_string(data["username"] || ""))
    password = to_string(data["password"] || "")

    client_ip = client_ip(conn)

    case rate_limited?(username, client_ip) do
      {true, retry_after} ->
        conn
        |> put_status(429)
        |> json(%{
          "success" => false,
          "error" => "Too many login attempts. Please wait #{retry_after}s and try again.",
          "retry_after" => retry_after
        })

      {false, _} ->
        cond do
          username == "" or String.length(username) > 128 ->
            record_attempt(username, client_ip, false)
            conn |> put_status(400) |> json(%{"success" => false, "error" => "Invalid username"})

          password == "" ->
            record_attempt(username, client_ip, false)
            conn |> put_status(400) |> json(%{"success" => false, "error" => "Password is required"})

          true ->
            do_login(conn, username, password, client_ip)
        end
    end
  end

  defp do_login(conn, username, password, client_ip) do
    case AuthService.authenticate(username, password) do
      nil ->
        record_attempt(username, client_ip, false)
        conn |> put_status(401) |> json(%{"success" => false, "error" => "Incorrect username or password"})

      user ->
        record_attempt(username, client_ip, true)
        issue_session(conn, user)
    end
  end

  defp issue_session(conn, user) do
    role_names = AuthService.role_names_for(user["id"])
    orgs = AuthService.orgs_for_user(user["id"])
    org_id = case orgs do
      [first | _] -> first["id"]
      [] -> nil
    end

    common = [user_id: user["id"], username: user["username"], roles: role_names, org_id: org_id]
    access_token = AuthService.generate_token(common ++ [token_type: "access"])
    refresh_token = AuthService.generate_token(common ++ [token_type: "refresh"])

    is_secure = conn.scheme == :https or get_req_header(conn, "x-forwarded-proto") |> List.first() == "https"

    conn
    |> put_resp_cookie(
      "radas_refresh_token",
      refresh_token,
      max_age: 7 * 86_400,
      http_only: true,
      same_site: "Lax",
      secure: is_secure,
      path: "/api/auth"
    )
    |> json(%{
      "success" => true,
      "access_token" => access_token,
      "refresh_token" => refresh_token,
      "orgs" => orgs,
      "active_org_id" => org_id,
      "user" => %{"id" => user["id"], "username" => user["username"], "email" => user["email"], "roles" => role_names}
    })
  end

  # -- refresh ------------------------------------------------------------------

  def refresh(conn, _params) do
    conn = fetch_cookies(conn)
    token = refresh_token_from(conn)

    if token in [nil, ""] do
      conn |> put_status(401) |> json(%{"success" => false, "error" => "Refresh token missing"})
    else
      data_dir = data_dir()
      claims = AuthService.verify_token(token, data_dir, "refresh")

      case claims do
        nil ->
          conn |> put_status(401) |> json(%{"success" => false, "error" => "Invalid or expired refresh token"})

        claims ->
          role_names = AuthService.role_names_for(claims["user_id"])
          orgs = AuthService.orgs_for_user(claims["user_id"])
          org_id =
            claims["org_id"] ||
              case orgs do
                [%{"id" => first} | _] -> first
                [] -> nil
              end

          common = [user_id: claims["user_id"], username: claims["username"], roles: role_names, org_id: org_id]
          access_token = AuthService.generate_token(common ++ [token_type: "access"])
          new_refresh = AuthService.generate_token(common ++ [token_type: "refresh"])

          # Rotation: retire the presented refresh token.
          AuthService.add_to_blacklist(data_dir, token)

          conn
          |> put_resp_cookie("radas_refresh_token", new_refresh,
            max_age: 7 * 86_400,
            http_only: true,
            same_site: "Lax",
            path: "/api/auth"
          )
          |> json(%{"success" => true, "access_token" => access_token, "refresh_token" => new_refresh})
      end
    end
  end

  # -- logout --------------------------------------------------------------------

  def logout(conn, _params) do
    auth_header = get_req_header(conn, "authorization") |> List.first()

    token =
      case auth_header do
        "Bearer " <> rest -> String.trim(rest)
        _ -> refresh_token_from(conn)
      end

    if token not in [nil, ""] do
      AuthService.add_to_blacklist(data_dir(), token)
    end

    conn
    |> delete_resp_cookie("radas_refresh_token", path: "/api/auth")
    |> json(%{"success" => true, "message" => "Logged out"})
  end

  # -- me (JWT-gated) ---------------------------------------------------------------

  def me(conn, _params) do
    user = conn.assigns[:current_user] || %{}

    case RadasAI.Identity.get_user(user["user_id"]) do
      nil ->
        conn |> put_status(401) |> json(%{"success" => false, "error" => "Invalid or expired token"})

      row ->
        json(conn, %{
          "success" => true,
          "user" => %{
            "id" => row["id"],
            "username" => row["username"],
            "email" => row["email"],
            "roles" => row["roles"]
          }
        })
    end
  end

  # -- SSO (Google / GitHub, env-gated) -------------------------------------------------

  def google_begin(conn, _params) do
    unless RadasAI.SSOAuth.google_configured?() do
      conn |> put_status(503) |> json(%{"success" => false, "error" => "Google SSO is not configured"})
    else
      result = RadasAI.SSOAuth.google_auth_url(redirect_uri: conn.query_params["redirect_uri"] || "")
      json(conn, %{"success" => true, "url" => result["url"], "state" => result["state"]})
    end
  end

  def google_callback(conn, _params) do
    finish_sso(conn, RadasAI.SSOAuth.google_callback(to_string(conn.query_params["code"] || ""), to_string(conn.query_params["state"] || "")))
  end

  def github_begin(conn, _params) do
    unless RadasAI.SSOAuth.github_configured?() do
      conn |> put_status(503) |> json(%{"success" => false, "error" => "GitHub SSO is not configured"})
    else
      result = RadasAI.SSOAuth.github_auth_url(redirect_uri: conn.query_params["redirect_uri"] || "")
      json(conn, %{"success" => true, "url" => result["url"], "state" => result["state"]})
    end
  end

  def github_callback(conn, _params) do
    finish_sso(conn, RadasAI.SSOAuth.github_callback(to_string(conn.query_params["code"] || ""), to_string(conn.query_params["state"] || "")))
  end

  defp finish_sso(conn, {:ok, user}) do
    role_names = AuthService.role_names_for(user["id"])
    orgs = AuthService.orgs_for_user(user["id"])

    org_id =
      case orgs do
        [first | _] -> first["id"]
        [] -> nil
      end

    access_token =
      AuthService.generate_token(
        user_id: user["id"],
        username: user["username"],
        roles: role_names,
        org_id: org_id,
        token_type: "access"
      )

    json(conn, %{
      "success" => true,
      "access_token" => access_token,
      "user" => %{"id" => user["id"], "username" => user["username"], "email" => user["email"], "roles" => role_names}
    })
  end

  defp finish_sso(conn, {:error, message}) do
    conn |> put_status(401) |> json(%{"success" => false, "error" => message})
  end

  # -- helpers --------------------------------------------------------------------

  defp refresh_token_from(conn) do
    cond do
      is_binary(conn.req_cookies["radas_refresh_token"]) and conn.req_cookies["radas_refresh_token"] != "" ->
        conn.req_cookies["radas_refresh_token"]

      is_binary(conn.body_params["refresh_token"]) and conn.body_params["refresh_token"] != "" ->
        conn.body_params["refresh_token"]

      true ->
        case get_req_header(conn, "authorization") |> List.first() do
          "Bearer " <> rest -> String.trim(rest)
          _ -> nil
        end
    end
  end

  defp data_dir do
    System.get_env("DATA_DIR") ||
      Path.join(File.cwd!(), "data")
  end

  defp client_ip(conn) do
    case get_req_header(conn, "x-forwarded-for") |> List.first() do
      nil ->
        case :inet.ntoa(conn.remote_ip) do
          {:error, _} -> "unknown"
          ip -> to_string(ip)
        end

      header ->
        header |> String.split(",") |> hd() |> String.trim()
    end
  end

  # In-process sliding-window limiter (mirrors services/login_security.py).
  defp rate_limited?(username, client_ip) do
    key = "#{client_ip}|#{username}"
    now = RadasAI.DB.now()
    window = :persistent_term.get(:radas_login_attempts, %{})

    attempts =
      window
      |> Map.get(key, [])
      |> Enum.reject(&(now - &1 > @window_seconds))

    if length(attempts) >= @max_attempts do
      retry_after = max(1, trunc(@window_seconds - (now - hd(attempts))))
      {true, retry_after}
    else
      {false, 0}
    end
  end

  defp record_attempt(username, client_ip, success) do
    unless success do
      key = "#{client_ip}|#{username}"
      now = RadasAI.DB.now()
      window = :persistent_term.get(:radas_login_attempts, %{})
      attempts = window |> Map.get(key, []) |> Enum.reject(&(now - &1 > @window_seconds))
      :persistent_term.put(:radas_login_attempts, Map.put(window, key, attempts ++ [now]))
    end
  end
end
