defmodule RadasWeb.CloudStacksController do
  @moduledoc """
  Port of the stack CRUD slice of `api_v2/cloud_stack_routes.py` +
  `services/cloud_provisioning.py::stacks_*`: list/create/show/update/delete
  stacks under `/api/v2/cloud/stacks` with auth via `RadasWeb.Plugs.Auth`.
  State routes (overview/lock/versions) delegate to `RadasAI.CloudState`
  (Python services/cloud_state.py route table).

  Runtime bodies mirror the v1 handlers (the platform plug normalizes
  ≥400 responses into the error envelope): create/update → `{"ok", "name"}`
  (create 201), delete → exactly `{"ok": true}`, show → the StackDetail map.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.CloudStacks
  alias RadasAI.CloudState
  alias RadasWeb.Plugs.OrgAccess

  defp project_id(conn, body \\ %{}),
    do: body["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

  # Python @require_project_access: org-membership gate on the resolved
  # project. Runs after the Auth plug; errors mirror the Python jsonify
  # bodies (the platform plug normalizes them into the error envelope).
  defp with_project_access(conn, project_id, fun) do
    case OrgAccess.ensure_project_access(conn, project_id) do
      :ok -> fun.()
      {:error, status, body} -> conn |> put_status(status) |> json(body)
    end
  end

  # -- list / create ------------------------------------------------------------

  def list(conn, _params) do
    with_project_access(conn, project_id(conn), fn ->
      json(conn, %{"stacks" => CloudStacks.list_stacks(project_id(conn))})
    end)
  end

  def create(conn, _params) do
    body = conn.body_params || %{}
    project_id = project_id(conn, body)

    with_project_access(conn, project_id, fn ->
      case CloudStacks.create_stack(project_id, body["name"], body["provider"] || "bytedc", body["values"] || %{}) do
        {:ok, name} -> conn |> put_status(201) |> json(%{"ok" => true, "name" => name})
        {:error, status, msg} -> conn |> put_status(status) |> json(%{"error" => msg})
      end
    end)
  end

  # -- show / update / delete -----------------------------------------------------

  def show(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      sd = CloudStacks.stack_dir(project_id, name)

      if not CloudStacks.valid_name?(name) or not File.dir?(sd) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        json(conn, CloudStacks.stack_detail(project_id, name))
      end
    end)
  end

  def update(conn, %{"name" => name}) do
    body = conn.body_params || %{}
    project_id = project_id(conn, body)

    with_project_access(conn, project_id, fn ->
      case CloudStacks.update_stack_values(project_id, name, body["values"] || %{}) do
        {:ok, name} -> json(conn, %{"ok" => true, "name" => name})
        {:error, status, msg} -> conn |> put_status(status) |> json(%{"error" => msg})
      end
    end)
  end

  def delete(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      force = conn.query_params["force"] in ["1", "true", "yes"]

      case CloudStacks.delete_stack(project_id, name, force) do
        {:ok, true} -> json(conn, %{"ok" => true})
        {:error, status, msg} -> conn |> put_status(status) |> json(%{"error" => msg})
      end
    end)
  end

  # -- state routes (CloudState delegation; Python cloud_state.py route table) -------

  def state_overview(conn, %{"name" => name}) do
    with_pid(conn, name, fn project_id, sd, dd ->
      versions = CloudState.list_versions(dd)
      src = CloudState.state_source(sd)

      summary =
        case src do
          nil -> %{"serial" => nil, "lineage" => nil, "resource_count" => 0, "tofu_version" => nil}
          path -> CloudState.summarize_state(File.read!(path))
        end

      json(conn,
        Map.merge(summary, %{
          "state_present" => src != nil,
          "state_source" => (src && Path.basename(src)) || nil,
          "lock" => CloudState.read_lock(dd, &RadasAI.Executions.get_execution/2, project_id),
          "versions" => Enum.take(versions, 20),
          "version_count" => length(versions),
          "backend" => CloudState.read_backend_config(sd)
        })
      )
    end)
  end

  def state_lock_get(conn, %{"name" => name}) do
    with_pid(conn, name, fn project_id, _sd, dd ->
      json(conn, %{"lock" => CloudState.read_lock(dd, &RadasAI.Executions.get_execution/2, project_id)})
    end)
  end

  def state_lock_acquire(conn, %{"name" => name}) do
    body = conn.body_params || %{}

    with_pid(conn, name, fn project_id, _sd, dd ->
      case CloudState.acquire_lock(dd,
             actor: (conn.assigns[:current_user] || %{})["user_id"],
             operation: String.slice(to_string(body["operation"] || "manual"), 0, 40),
             note: String.slice(to_string(body["note"] || ""), 0, 300),
             get_execution: &RadasAI.Executions.get_execution/2,
             project_id: project_id
           ) do
        %{"ok" => true, "lock" => lock} -> conn |> put_status(201) |> json(%{"ok" => true, "lock" => lock})

        %{"ok" => false, "lock" => existing} ->
          conn |> put_status(409) |> json(%{"error" => "Stack state is already locked.", "ok" => false, "lock" => existing})
      end
    end)
  end

  def state_lock_release(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, _sd, dd ->
      res =
        CloudState.release_lock(dd,
          lock_id: conn.query_params["lock_id"],
          actor: (conn.assigns[:current_user] || %{})["user_id"],
          force: conn.query_params["force"] in ["1", "true", "yes"],
          reason: conn.query_params["reason"] || ""
        )

      if res["ok"] do
        json(conn, res)
      else
        conn |> put_status(409) |> json(res)
      end
    end)
  end

  def state_versions_list(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, _sd, dd ->
      versions = CloudState.list_versions(dd)
      json(conn, %{"versions" => versions, "count" => length(versions), "max" => CloudState.max_versions()})
    end)
  end

  def state_versions_snapshot(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, sd, dd ->
      case CloudState.snapshot_state(sd, dd,
             actor: (conn.assigns[:current_user] || %{})["user_id"],
             reason: "manual"
           ) do
        nil ->
          conn
          |> put_status(409)
          |> json(%{
            "ok" => false,
            "error" =>
              "Nothing to snapshot — no state file on disk, or it is identical to the latest version."
          })

        entry ->
          conn |> put_status(201) |> json(%{"ok" => true, "version" => entry})
      end
    end)
  end

  # -- shared resolution (Python cloud_state._resolve) ----------------------------

  defp with_pid(conn, name, fun) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      if not CloudStacks.valid_name?(name) or not File.dir?(CloudStacks.stack_dir(project_id, name)) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        fun.(project_id, CloudStacks.stack_dir(project_id, name), CloudStacks.stack_data_dir(project_id, name))
      end
    end)
  end
end
