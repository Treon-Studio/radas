defmodule RadasWeb.HealthController do
  @moduledoc "Bootstrap health endpoint for the Elixir server (Phase 0)."

  use RadasWeb, :controller

  def show(conn, _params) do
    json(conn, %{"status" => "ok", "service" => "radas_elixir"})
  end
end
