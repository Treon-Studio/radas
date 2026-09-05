defmodule RadasWeb.QueueController do
  @moduledoc """
  Port of the queue surface of `api/queue_search_routes.py` (Phase 3):
  `GET /api/queue` returns the project's QUEUED executions oldest-first.
  """

  use RadasWeb, :controller

  import RadasAI.DB

  defp project_id(conn),
    do: conn.query_params["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

  def show(conn, _params) do
    project_id = project_id(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})
    else
      limit = clamp(query_int(conn, "limit", 100), 1, 500)

      rows =
        query_all!(
          """
          SELECT data FROM executions
          WHERE project_id = $1 AND data->>'status' = 'QUEUED'
          ORDER BY created_at ASC LIMIT #{limit}
          """,
          [project_id]
        )

      queued = Enum.map(rows, & &1["data"])
      json(conn, %{"success" => true, "queued" => queued, "count" => length(queued)})
    end
  rescue
    e -> conn |> put_status(500) |> json(%{"success" => false, "error" => Exception.message(e)})
  end

  defp query_int(conn, key, default) do
    case Integer.parse(conn.query_params[key] || "") do
      {n, _} -> n
      :error -> default
    end
  end

  defp clamp(v, min, max), do: min(max(v, min), max)
end
