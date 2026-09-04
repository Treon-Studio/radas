defmodule RadasWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :radas

  # API-only endpoint: no static assets, no sessions, no LiveView sockets.
  # Clients (console, CLI, worker) speak JSON over /api/*.

  if code_reloading? do
    plug Phoenix.CodeReloader
  end

  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.Head

  # App-level hooks (mirror Flask's before_request/after_request handlers):
  # CORS for every /api/* request (including preflight short-circuit) and the
  # platform contract finalizer — installed here so unmatched-path 404s inside
  # the platform namespace are still normalized, like Flask's after_request.
  plug RadasWeb.Plugs.Cors
  plug RadasWeb.Plugs.PlatformContract
  plug RadasWeb.Router
end
