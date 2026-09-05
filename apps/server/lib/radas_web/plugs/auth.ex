defmodule RadasWeb.Plugs.Auth do
  @moduledoc """
  Port of `require_auth` in `auth/middleware.py` for the legacy namespace.

  Accepts, in order: the internal-call header (scheduler/background calls),
  RADAS JWTs (signature, expiry, token_type, blacklist, session revocation),
  and worker tokens (`RadasAI.WorkerRegistry` — the Go worker authenticates
  with its registry token on any path, matching Python's middleware worker
  branch). Enforces the `readonly` role on non-GET requests outside
  /api/auth. Sets `current_user` on the conn.
  """

  import Plug.Conn

  alias RadasAI.{AuthService, WorkerRegistry}

  def init(opts \\ []), do: opts

  def call(conn, _opts) do
    conn
    |> try_internal_call()
    |> try_token()
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

  defp try_token({:ok, conn}), do: {:ok, conn}

  defp try_token({:skip, conn}) do
    token = token_from(conn)

    if token in [nil, ""] do
      {:skip, conn}
    else
      cond do
        jwt = AuthService.verify_token(token, data_dir(), "access") ->
          current_user = %{
            "user_id" => jwt["user_id"],
            "username" => jwt["username"],
            "roles" => jwt["roles"] || [],
            "org_id" => jwt["org_id"]
          }

          readonly_blocked?(conn, current_user)
          |> finish(conn, current_user, token)

        worker_match(worker_token_match(token)) ->
          {worker_id, _worker} = worker_token_match(token)

          current_user = %{
            "user_id" => "__worker__:" <> worker_id,
            "username" => "worker:" <> String.slice(worker_id, 0, 8),
            "roles" => []
          }

          readonly_blocked?(conn, current_user)
          |> finish(conn, current_user, token)

        true ->
          {:denied, conn, 401, "Invalid or expired token"}
      end
    end
  end

  # cond clauses evaluate for truthiness — a nil from verify_token would
  # raise inside a bare match, so unwrap via a nil-tolerant helper.
  defp worker_token_match(token) do
    case WorkerRegistry.verify_token(token) do
      nil -> nil
      result -> result
    end
  end

  defp worker_match({worker_id, worker} = result) when is_binary(worker_id) and is_map(worker), do: result
  defp worker_match(_), do: false

  defp readonly_blocked?(conn, current_user) do
    "readonly" in List.wrap(current_user["roles"]) and
      conn.method not in ["GET", "HEAD", "OPTIONS"] and
      not String.starts_with?(conn.request_path, "/api/auth/")
  end

  defp finish(false, conn, current_user, token),
    do: {:ok, conn |> assign(:current_user, current_user) |> assign(:token, token)}

  defp finish(true, conn, _current_user, _token),
    do: {:denied, conn, 403, "This account has read-only access."}

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
