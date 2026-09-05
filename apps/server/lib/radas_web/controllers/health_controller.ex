defmodule RadasWeb.HealthController do
  @moduledoc "Bootstrap health endpoint for the Elixir server (Phase 0)."

  use RadasWeb, :controller

  def show(conn, _params) do
    json(conn, %{"status" => "ok", "service" => "radas"})
  end

  @doc "Lightweight readiness probe (Python misc_routes.api_health)."
  @spec misc_health(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def misc_health(conn, _params), do: json(conn, %{"success" => true, "status" => "ok"})
end
