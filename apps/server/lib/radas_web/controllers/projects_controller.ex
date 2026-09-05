defmodule RadasWeb.ProjectsController do
  @moduledoc """
  Port of the platform-envelope project routes (`/api/projects`): the
  legacy list/create project surface with org-scoping (Fase 7 — D2).
  """

  use RadasWeb, :controller

  import Plug.Conn
  import RadasAI.DB

  alias RadasWeb.Plugs.OrgAccess

  defp projects_payload(user_id, include_archived) do
    my_org_ids =
      if user_id in [nil, ""] do
        []
      else
        RadasAI.Identity.list_orgs_for_user(user_id) |> Enum.map(& &1["id"])
      end

    projects =
      query_all!(
        """
        SELECT id, org_id, owner_id, name, description, is_archived, created_at, updated_at
        FROM projects ORDER BY COALESCE(created_at, 0) ASC, id ASC
        """,
        []
      )

    projects
    |> Enum.filter(&(is_map(&1) and (&1["org_id"] in [nil, ""] or &1["org_id"] in my_org_ids)))
    |> Enum.filter(&(include_archived or &1["is_archived"] not in [1, true]))
    |> Enum.map(fn p -> Map.update!(p, "is_archived", fn v -> v in [1, true] end) end)
  end

  def list(conn, _params) do
    user = conn.assigns[:current_user] || %{}
    include_archived = String.downcase(conn.query_params["include_archived"] || "false") == "true"
    projects = projects_payload(user["user_id"], include_archived)
    json(conn, %{"success" => true, "projects" => projects})
  end

  def create(conn, _params) do
    data = conn.body_params || %{}
    user = conn.assigns[:current_user] || %{}
    name = String.trim(to_string(data["name"] || ""))

    if name == "" do
      conn |> put_status(400) |> json(%{"error" => "name required"})
    else
      org_id = data["org_id"] || OrgAccess.resolve_org_id(conn)

      if user["user_id"] != "__internal__" and not OrgAccess.is_member?(org_id, user["user_id"]) do
        conn |> put_status(403) |> json(%{"error" => "organization access denied"})
      else
        pid = data["id"] || data["projectId"] || Ecto.UUID.generate()
        now_ts = RadasAI.DB.now()

        execute!(
          """
          INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 0, $6::double precision, $6::double precision)
          ON CONFLICT (id) DO NOTHING
          """,
          [pid, org_id, user["user_id"], name, to_string(data["description"] || ""), now_ts]
        )

        row = query_one!("SELECT id, org_id, owner_id, name, description, is_archived, created_at, updated_at FROM projects WHERE id = $1", [pid])
        row = Map.update!(row, "is_archived", fn v -> v in [1, true] end)
        json(conn, %{"success" => true, "project" => row})
      end
    end
  end
end
