defmodule RadasWeb.CostController do
  @moduledoc """
  Port of `api/cost_routes.py` — the 13 `/api/cost/*` routes (pricing CRUD,
  estimate engine, saved estimates, reports, plan extraction).

  Parity note: the Python blueprint ships WITHOUT auth decorators (public
  namespace) — mirrored here; hardening lands as a deliberate follow-up.
  Project scoping uses `X-Project-Id` (default "default"), like Python.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.CostStore

  defp project_id(conn), do: get_req_header(conn, "x-project-id") |> List.first() || "default"

  # -- Pricing -----------------------------------------------------------------

  def pricing_list(conn, _params) do
    json(conn, CostStore.list_pricing())
  end

  def pricing_show(conn, %{"provider" => provider}) do
    case CostStore.get_pricing(provider) do
      {:ok, catalog} -> json(conn, catalog)
      {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
    end
  end

  def pricing_update(conn, %{"provider" => provider}) do
    case CostStore.save_pricing(provider, conn.body_params || %{}) do
      {:ok, catalog} -> json(conn, catalog)
      {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
    end
  end

  def pricing_history(conn, %{"provider" => provider}) do
    json(conn, CostStore.get_pricing_history(provider))
  end

  # -- Estimate engine ----------------------------------------------------------

  def estimate(conn, _params) do
    body = conn.body_params || %{}
    provider = String.downcase(to_string(body["provider"] || "bytedc"))
    resources = body["resources"] || []

    unless is_list(resources) do
      conn |> put_status(400) |> json(%{"error" => "resources must be an array"})
    else
      case CostStore.estimate_cost(provider, resources) do
        {:ok, result} -> json(conn, result)
        {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
      end
    end
  end

  # -- Saved estimates -------------------------------------------------------------

  def estimates_list(conn, _params) do
    json(conn, %{"estimates" => CostStore.list_estimates(project_id(conn))})
  end

  def estimates_save(conn, _params) do
    record = CostStore.save_estimate(project_id(conn), conn.body_params || %{})
    json(conn, record)
  end

  def estimates_delete(conn, %{"estimate_id" => estimate_id}) do
    json(conn, %{"success" => CostStore.delete_estimate(project_id(conn), estimate_id)})
  end

  # -- Reports ---------------------------------------------------------------------

  def reports_list(conn, _params) do
    stack = conn.query_params["stack"]
    limit = parse_int(conn.query_params["limit"], 500)
    json(conn, %{"reports" => CostStore.list_reports(project_id(conn), stack: stack, limit: limit)})
  end

  def reports_show(conn, %{"report_id" => report_id}) do
    case CostStore.get_report(project_id(conn), report_id) do
      nil -> conn |> put_status(404) |> json(%{"error" => "Report not found"})
      report -> json(conn, report)
    end
  end

  def reports_delete(conn, %{"report_id" => report_id}) do
    json(conn, %{"success" => CostStore.delete_report(project_id(conn), report_id)})
  end

  def reports_create(conn, _params) do
    body = conn.body_params || %{}
    provider = String.downcase(to_string(body["provider"] || "bytedc"))
    resources = body["resources"] || []
    stack = to_string(body["stack"] || "manual")

    with {:ok, result} <- compute_result(provider, resources, body["result"]) do
      report =
        CostStore.save_report(
          project_id: project_id(conn),
          provider: provider,
          stack: stack,
          resources: resources,
          result: result,
          source: to_string(body["source"] || "manual"),
          run_id: body["run_id"],
          env: body["env"],
          cloud_project: body["cloud_project"]
        )

      json(conn, report)
    else
      {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
    end
  end

  # -- Plan extraction -------------------------------------------------------------

  def extract_from_plan(conn, _params) do
    body = conn.body_params || %{}
    plan = body["plan"]

    plan =
      cond do
        is_binary(plan) ->
          case Jason.decode(plan) do
            {:ok, decoded} -> decoded
            _ -> :invalid
          end

        true ->
          plan
      end

    case plan do
      :invalid ->
        conn |> put_status(400) |> json(%{"error" => "plan must be valid JSON"})

      nil ->
        conn |> put_status(400) |> json(%{"error" => "plan is required"})

      plan when is_map(plan) ->
        case CostStore.extract_from_plan(plan) do
          {:ok, resources} -> json(conn, %{"resources" => resources, "count" => length(resources)})
          {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
        end

      true ->
        conn |> put_status(400) |> json(%{"error" => "plan is required"})
    end
  end

  # -- helpers ------------------------------------------------------------------------

  defp compute_result(_provider, _resources, result) when is_map(result), do: {:ok, result}

  defp compute_result(provider, resources, nil) do
    CostStore.estimate_cost(provider, resources)
  end

  defp parse_int(nil, default), do: default

  defp parse_int(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(value, _default) when is_integer(value), do: value
end
