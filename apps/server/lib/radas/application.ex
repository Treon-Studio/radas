defmodule Radas.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Radas.Repo,
      RadasAI.RateLimit,
      # First-run bootstrap (default roles/permissions/admin) — idempotent,
      # fail-open, mirrors auth/seed.py's __main__-only invocation.
      # Parity with Python: the seed runs on server boot only, never in tests
      # (pytest never seeds either; tests construct their own fixtures).
      %{
        id: :identity_seed,
        start:
          {Task, :start_link,
           [fn -> unless Application.get_env(:radas, :gateway_testing), do: safe_seed() end]},
        restart: :temporary
      },
      # Start to serve requests, typically the last entry
      RadasWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Radas.Supervisor]
    Supervisor.start_link(children, opts)
  end

  defp safe_seed do
    RadasAI.Seed.seed_all()
  rescue
    e ->
      require Logger
      Logger.warning("identity seed skipped: #{Exception.message(e)}")
  end

  @impl true
  def config_change(changed, _new, removed) do
    RadasWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
