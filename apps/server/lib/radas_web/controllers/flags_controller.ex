defmodule RadasWeb.FlagsController do
  @moduledoc """
  Port of `api/feature_flag_routes.py` — the load-bearing subset of the
  /api/flags surface: CRUD, audit, expire-due, evaluate (worker + console
  contract: `{enabled, reason}`), export/import. Mutations require auth
  (JWT/internal-call) with admin for global scope; evaluate is public like
  Python (worker bearer accepted but not required).
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.Flags

  defp actor(conn), do: (conn.assigns[:current_user] || %{})["user_id"] || "system"

  defp admin?(conn) do
    user = conn.assigns[:current_user] || %{}
    "admin" in List.wrap(user["roles"]) or user["username"] == "internal"
  end

  defp opts(conn, mutation) do
    body = conn.body_params || %{}
    scope_type = to_string(body["scope_type"] || conn.query_params["scope_type"] || "global")
    scope_id = to_string(body["scope_id"] || conn.query_params["scope_id"] || "")

    cond do
      not admin?(conn) and mutation ->
        {:denied, conn}

      scope_type == "global" and mutation and not admin?(conn) ->
        {:denied, conn}

      true ->
        {:ok, [scope_type: scope_type, scope_id: if(scope_id == "", do: nil, else: scope_id), actor: actor(conn)]}
    end
  end

  # -- list / CRUD ---------------------------------------------------------------

  def list(conn, _params) do
    case opts(conn, false) do
      {:ok, opts} ->
        flags = Flags.load(opts[:scope_type], opts[:scope_id])

        flags =
          Flags.filter_flags(flags, conn.query_params["tag"] || "", conn.query_params["env"] || "", parse_enabled(conn.query_params["enabled"]))

        json(conn, %{"flags" => flags})

      {:denied, conn} ->
        conn |> put_status(403) |> json(%{"error" => "admin required"})
    end
  end

  def create(conn, _params) do
    case opts(conn, true) do
      {:ok, opts} ->
        case Flags.create_flag(conn.body_params || %{}, opts) do
          {:ok, flag} -> json(conn, %{"success" => true, "flag" => flag})
          {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
        end

      {:denied, conn} ->
        conn |> put_status(403) |> json(%{"error" => "admin required"})
    end
  end

  def update(conn, %{"key" => key}) do
    case opts(conn, true) do
      {:ok, opts} ->
        case Flags.update_flag(key, conn.body_params || %{}, opts) do
          {:ok, flag} -> json(conn, %{"success" => true, "flag" => flag})
          nil -> conn |> put_status(404) |> json(%{"error" => "Flag not found"})
        end

      {:denied, conn} ->
        conn |> put_status(403) |> json(%{"error" => "admin required"})
    end
  end

  def delete(conn, %{"key" => key}) do
    case opts(conn, true) do
      {:ok, opts} ->
        json(conn, %{"success" => Flags.delete_flag(key, opts)})

      {:denied, conn} ->
        conn |> put_status(403) |> json(%{"error" => "admin required"})
    end
  end

  # -- audit / expire -----------------------------------------------------------------

  def audit(conn, _params) do
    case opts(conn, false) do
      {:ok, opts} ->
        limit = parse_int(conn.query_params["limit"], 100)
        entries = Flags.audit(opts[:scope_type], opts[:scope_id], conn.query_params["key"], limit)
        json(conn, %{"audit" => entries})

      {:denied, conn} ->
        conn |> put_status(403) |> json(%{"error" => "admin required"})
    end
  end

  def expire_due(conn, _params) do
    json(conn, %{"success" => true, "expiredCount" => Flags.expire_due_flags()})
  end

  # -- evaluate (worker + console) -------------------------------------------------------

  def evaluate(conn, _params) do
    body = conn.body_params || %{}
    key = String.trim(to_string(body["key"] || ""))

    if key == "" do
      conn |> put_status(400) |> json(%{"error" => "key required"})
    else
      scope_type = to_string(body["scope_type"] || "global")
      _scope_id = body["scope_id"]

      opts =
        cond do
          scope_type == "project" and body["project_id"] not in [nil, ""] ->
            [scope_type: "project", scope_id: to_string(body["project_id"])]

          scope_type == "organization" and body["org_id"] not in [nil, ""] ->
            [scope_type: "organization", scope_id: to_string(body["org_id"])]

          true ->
            [scope_type: "global", scope_id: nil]
        end

      json(conn, Flags.safe_evaluate(key, Keyword.merge(opts, env: to_string(body["env"] || "prod"), user: to_string(body["user"] || ""))))
    end
  end

  # -- export / import ---------------------------------------------------------------------

  def export(conn, _params) do
    json(conn, Flags.export_flags())
  end

  def import(conn, _params) do
    case opts(conn, true) do
      {:ok, opts} ->
        case Flags.import_flags(conn.body_params["flags"] || conn.body_params, opts) do
          {:ok, count} -> json(conn, %{"success" => true, "imported" => count})
          {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
        end

      {:denied, conn} ->
        conn |> put_status(403) |> json(%{"error" => "admin required"})
    end
  end

  # -- helpers ---------------------------------------------------------------------------

  defp parse_enabled(nil), do: nil

  defp parse_enabled(value) when is_binary(value),
    do: String.downcase(String.trim(value)) in ["1", "true", "yes"]

  defp parse_int(nil, default), do: default

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(v, _default) when is_integer(v), do: v
end
