defmodule RadasWeb.Plugs.Cors do
  @moduledoc """
  Port of `app.py` CORS handling (`handle_api_options_preflight` +
  `add_api_cors_headers`).

  - Origins come from `CORS_ALLOWED_ORIGINS` (comma-separated) and default to
    the local console on port 8080.
  - Preflight `OPTIONS /api/*` short-circuits with a 204 and echoes the
    requested headers.
  - Every `/api/*` response carries the CORS headers when the Origin is
    allowlisted (even if the preflight path did not run).
  """

  import Plug.Conn

  @default_origins ["http://localhost:8080", "http://127.0.0.1:8080", "http://0.0.0.0:8080"]

  @default_allow_headers ~w(Content-Type Authorization X-Requested-With Accept X-Project-Id X-Org-Id X-9Router-Token-Saver X-Request-Id X-Trace-Id Idempotency-Key)
  @allow_methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"

  def init(opts), do: opts

  def call(%{request_path: "/api/" <> _} = conn, _opts) do
    case conn.method do
      "OPTIONS" -> preflight(conn)
      _ -> apply_cors(conn)
    end
  end

  def call(conn, _opts), do: conn

  defp preflight(conn) do
    requested =
      get_req_header(conn, "access-control-request-headers")
      |> List.first()
      |> case do
        nil -> Enum.join(@default_allow_headers, ", ")
        "" -> Enum.join(@default_allow_headers, ", ")
        value -> value
      end

    conn =
      conn
      |> put_resp_header("access-control-allow-headers", requested)
      |> put_resp_header("access-control-allow-methods", @allow_methods)
      |> apply_cors()
      |> send_resp(204, "")

    halt(conn)
  end

  defp apply_cors(conn) do
    with [origin] <- get_req_header(conn, "origin"),
         true <- origin_allowed?(origin) do
      conn
      |> put_resp_header("access-control-allow-origin", origin)
      |> put_resp_header("access-control-allow-credentials", "true")
      |> put_resp_header("vary", "Origin")
    else
      _ -> conn
    end
  end

  defp origin_allowed?(origin) do
    Enum.member?(allowed_origins(), origin)
  end

  @doc "Configured CORS origins (resolved from env at call time, like Python)."
  def allowed_origins do
    env = Application.get_env(:radas, :cors_allowed_origins)

    if is_list(env) and env != [] do
      env
    else
      raw = System.get_env("CORS_ALLOWED_ORIGINS", Enum.join(@default_origins, ","))

      raw
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
    end
  end

  @doc "Default allow-headers list (used when the preflight request sends none)."
  def default_allow_headers, do: @default_allow_headers
end
