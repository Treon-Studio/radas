defmodule RadasWeb.HealthController do
  @moduledoc "Liveness and dependency-readiness probes for the Phoenix server."

  use RadasWeb, :controller

  alias Radas.Repo

  @historical_schema_versions 1..30
  @required_runtime_envs ~w(JWT_SECRET_KEY INTERNAL_CALL_SECRET GLOBAL_SECRETS_ENCRYPTION_KEY)

  def show(conn, _params) do
    json(conn, %{"status" => "ok", "service" => "radas"})
  end

  @doc "Return dependency readiness without changing the liveness contract."
  @spec ready(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def ready(conn, _params) do
    case readiness() do
      :ok ->
        request_id = Radas.RequestID.current(conn) || Radas.RequestID.generate()

        json(
          conn,
          Radas.Envelope.success(%{"status" => "ready", "service" => "radas"}, request_id)
        )

      {:error, code, message} ->
        conn
        |> put_status(503)
        |> json(
          Radas.Envelope.error(
            code,
            message,
            Radas.RequestID.current(conn) || Radas.RequestID.generate()
          )
        )
    end
  end

  @doc "Lightweight legacy readiness probe (Python misc_routes.api_health)."
  @spec misc_health(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def misc_health(conn, _params), do: json(conn, %{"success" => true, "status" => "ok"})

  defp readiness do
    with :ok <- database_ready(),
         :ok <- migration_ledgers_ready(),
         :ok <- runtime_config_ready() do
      :ok
    end
  end

  defp database_ready do
    try do
      case Repo.query("SELECT 1") do
        {:ok, %{rows: [[1]]}} -> :ok
        _ -> {:error, "DATABASE_UNAVAILABLE", "Database is not ready"}
      end
    rescue
      _ -> {:error, "DATABASE_UNAVAILABLE", "Database is not ready"}
    end
  end

  defp migration_ledgers_ready do
    historical = Enum.to_list(@historical_schema_versions)

    with {:ok, %{rows: rows}} <-
           Repo.query("SELECT version FROM schema_migrations WHERE version BETWEEN 1 AND 30"),
         ^historical <- rows |> Enum.map(fn [version] -> version end) |> Enum.sort(),
         {:ok, %{rows: [[count]]}} <- Repo.query("SELECT count(*) FROM ecto_migrations") do
      if count > 0,
        do: :ok,
        else: {:error, "MIGRATIONS_INCOMPLETE", "Database migrations are incomplete"}
    else
      _ -> {:error, "MIGRATIONS_INCOMPLETE", "Database migrations are incomplete"}
    end
  rescue
    _ -> {:error, "MIGRATIONS_INCOMPLETE", "Database migrations are incomplete"}
  end

  defp runtime_config_ready do
    if Enum.all?(@required_runtime_envs, &(System.get_env(&1) not in [nil, ""])) do
      :ok
    else
      {:error, "CONFIGURATION_INVALID", "Required runtime configuration is missing"}
    end
  end
end
