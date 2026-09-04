defmodule RadasWeb.Plugs.Auth do
  @moduledoc """
  Port of `require_auth` in `auth/middleware.py` for the legacy namespace.

  Accepts, in order: the internal-call header (scheduler/background calls),
  RADAS JWTs (signature, expiry, token_type, blacklist), and long-lived API
  tokens. Enforces the `readonly` role on non-GET requests outside /api/auth.
  Sets `current_user` on the conn. Worker-token verification lands with the
  Phase 4 execution cutover (worker paths stay on Flask until then).
  """

  import Plug.Conn

  alias RadasAI.AuthService

  def init(opts \\ []), do: opts

  def call(conn, _opts) do
    conn
    |> try_internal_call()
    |> try_jwt()
    |> case do
      {:ok, conn} -> conn
      {:skip, conn} -> deny(conn, 401, "Access token missing")
      {:denied, conn, status, message} -> deny(conn, status, message)
    end
  end

  defp try_internal_call(conn) do
    provided = get_req_header(conn, "x-internal-call") |> List.first()
    secret = System.get_env("INTERNAL_CALL_SECRET")

    if provided && secret && Plug.Crypto.secure_compare(provided, secret) do
      {:ok,
       conn
       |> assign(:current_user, %{
         "username" => "internal",
         "user_id" => "__internal__",
         "roles" => ["admin"]
       })
       |> assign(:token, nil)}
    else
      {:skip, conn}
    end
  end

  defp try_jwt({:ok, conn}), do: {:ok, conn}

  defp try_jwt({:skip, conn}) do
    token = token_from(conn)

    if token in [nil, ""] do
      {:skip, conn}
    else
      claims = AuthService.verify_token(token, data_dir(), "access")

      cond do
        claims == nil ->
          {:denied, conn, 401, "Invalid or expired token"}

        readonly_blocked?(conn, claims) ->
          {:denied, conn, 403, "This account has read-only access."}

        true ->
          {:ok,
           conn
           |> assign(:current_user, %{
             "user_id" => claims["user_id"],
             "username" => claims["username"],
             "roles" => claims["roles"] || [],
             "org_id" => claims["org_id"]
           })
           |> assign(:token, token)}
      end
    end
  end

  defp readonly_blocked?(conn, claims) do
    "readonly" in List.wrap(claims["roles"]) and
      conn.method not in ["GET", "HEAD", "OPTIONS"] and
      not String.starts_with?(conn.request_path, "/api/auth/")
  end

  defp token_from(conn) do
    case get_req_header(conn, "authorization") |> List.first() do
      "Bearer " <> rest -> String.trim(rest)
      _ -> nil
    end
  end

  defp data_dir, do: System.get_env("DATA_DIR") || Path.join(File.cwd!(), "data")

  defp deny(conn, status, message) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(%{"error" => message, "message" => message}))
    |> halt()
  end
end
