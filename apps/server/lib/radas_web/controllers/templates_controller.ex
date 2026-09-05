defmodule RadasWeb.TemplatesController do
  @moduledoc """
  Port of `api/templates_routes.py` catalog routes (list/detail/render) plus
  the ansible-run execution-record creation from `api/ansible_run_routes.py`.

  The ansible-playbook subprocess itself stays on Flask during coexistence —
  Elixir creates the shared QUEUED execution record so the Go worker claims
  it through the same protocol (Phase 4).
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.{ExecutionHistory, ProjectPaths, TemplateInstances, Templates}

  # -- catalog -------------------------------------------------------------------

  def list(conn, _params), do: json(conn, %{"templates" => Templates.list_templates()})

  def show(conn, %{"template_id" => template_id}) do
    case Templates.get_template(template_id) do
      nil -> conn |> put_status(404) |> json(%{"error" => "not found"})
      t -> json(conn, t)
    end
  end

  def render(conn, %{"template_id" => template_id}) do
    body = conn.body_params || %{}

    case Templates.render_template(template_id, body["values"] || %{}, body["targets"] || %{}) do
      {:ok, result} -> json(conn, result)
      {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
    end
  end

  # -- save / instances (Build & Deployment Jobs; templates_routes.py) ---------------

  def save(conn, %{"template_id" => template_id}) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      conn |> put_status(400) |> json(%{"error" => "project_id is required"})
    else
      case TemplateInstances.save(project_id, template_id, conn.body_params || %{}) do
        {:ok, payload} -> json(conn, payload)
        {:error, msg} -> conn |> put_status(400) |> json(%{"error" => msg})
      end
    end
  end

  def instances_list(conn, _params) do
    case project_id_from(conn) do
      pid when pid in [nil, ""] ->
        conn |> put_status(400) |> json(%{"error" => "project_id is required"})

      pid ->
        json(conn, %{"instances" => TemplateInstances.list_instances(pid)})
    end
  end

  defp resolve_instance(conn) do
    project_id = project_id_from(conn)

    if project_id in [nil, ""] do
      {:error, :project}
    else
      params =
        Map.merge(conn.query_params || %{}, %{
          "id" => conn.query_params["id"],
          "path" => conn.query_params["path"],
          "env" => conn.query_params["env"] || conn.query_params["environment"],
          "filename" => conn.query_params["filename"] || conn.query_params["name"],
          "template_id" => conn.query_params["template_id"]
        })

      case TemplateInstances.resolve_instance(project_id, params) do
        nil -> {:error, :not_found}
        path -> {:ok, project_id, path}
      end
    end
  end

  def instances_detail(conn, _params) do
    case resolve_instance(conn) do
      {:error, :project} -> conn |> put_status(400) |> json(%{"error" => "project_id is required"})
      {:error, :not_found} -> conn |> put_status(404) |> json(%{"error" => "not found"})
      {:ok, project_id, path} ->
        case TemplateInstances.instance_detail(project_id, path) do
          nil -> conn |> put_status(400) |> json(%{"error" => "invalid config"})
          detail -> json(conn, detail)
        end
    end
  end

  def instances_delete(conn, _params) do
    case resolve_instance(conn) do
      {:error, :project} -> conn |> put_status(400) |> json(%{"error" => "project_id is required"})
      {:error, :not_found} -> conn |> put_status(404) |> json(%{"error" => "not found"})
      {:ok, project_id, path} ->
        {:ok, removed} = TemplateInstances.delete_instance(project_id, path)
        json(conn, %{"ok" => true, "removed" => removed})
    end
  end

  def instances_history(conn, _params) do
    case resolve_instance(conn) do
      {:error, :project} -> conn |> put_status(400) |> json(%{"error" => "project_id is required"})
      {:error, :not_found} -> conn |> put_status(404) |> json(%{"error" => "not found"})
      {:ok, project_id, path} ->
        case TemplateInstances.instance_history(project_id, path) do
          {:ok, payload} -> json(conn, payload)
          {:error, payload} -> json(conn, payload)
        end
    end
  end

  def instances_version(conn, _params) do
    case resolve_instance(conn) do
      {:error, :project} -> conn |> put_status(400) |> json(%{"error" => "project_id is required"})
      {:error, :not_found} -> conn |> put_status(404) |> json(%{"error" => "not found"})
      {:ok, project_id, path} ->
        case TemplateInstances.instance_version(project_id, path, conn.query_params["sha"]) do
          {:ok, payload} -> json(conn, payload)
          {:error, payload} ->
            status = if payload["error"] in ["invalid sha", "path and sha required"], do: 400, else: 404
            conn |> put_status(status) |> json(payload)
        end
    end
  end

  # -- custom templates (Fase 5 — UC 15/96) -----------------------------------------

  def custom_list(conn, _params) do
    root = custom_dir()

    templates =
      case File.ls(root) do
        {:ok, entries} ->
          entries
          |> Enum.sort()
          |> Enum.filter(&(String.starts_with?(&1, ".") == false and File.dir?(Path.join(root, &1))))
          |> Enum.map(&%{"name" => &1, "path" => Path.join(root, &1)})

        _ ->
          []
      end

    json(conn, %{"templates" => templates})
  end

  def custom_import(conn, _params) do
    data = conn.body_params || %{}
    name = String.trim(to_string(data["name"] || ""))
    git_url = String.trim(to_string(data["git_url"] || ""))

    if name == "" or git_url == "" do
      conn |> put_status(400) |> json(%{"error" => "name and git_url required"})
    else
      slug =
        name
        |> String.downcase()
        |> String.replace(~r/[^a-z0-9-]+/, "-")
        |> String.trim("-")
        |> then(&(if &1 == "", do: "template", else: &1))

      root = custom_dir()
      dst = Path.join(root, slug)

      if File.exists?(dst) do
        conn |> put_status(400) |> json(%{"error" => "template '#{slug}' already exists"})
      else
        File.mkdir_p!(root)

        case System.cmd("git", ["clone", "--depth", "1", git_url, dst], stderr_to_stdout: true) do
          {_, 0} ->
            json(conn, %{"name" => slug, "path" => dst})

          {out, _} ->
            File.rm_rf!(dst)
            conn |> put_status(400) |> json(%{"error" => "git clone failed: " <> String.slice(String.trim(out), 0, 200)})
        end
      end
    end
  rescue
    e in File.Error -> conn |> put_status(400) |> json(%{"error" => Exception.message(e)})
  end

  defp custom_dir, do: Path.join([ProjectPaths.data_dir(), "custom-templates"])

  defp project_id_from(conn),
    do: get_req_header(conn, "x-project-id") |> List.first() || conn.query_params["project_id"]

  # -- run_ansible: create the shared execution record -----------------------------

  @doc """
  Port of POST /api/run_ansible (lean): validates playbook/hosts and creates
  a QUEUED execution record via ExecutionHistory. The ansible-playbook
  subprocess stays on Flask during coexistence; the record is shared state.
  """
  def run(conn, _params) do
    body = conn.body_params || %{}
    project_id = body["project_id"] || get_req_header(conn, "x-project-id") |> List.first()
    playbook_name = String.trim(to_string(body["playbook_name"] || body["playbook"] || ""))
    selected_hosts = body["selected_hosts"] || []

    cond do
      project_id in [nil, ""] ->
        conn |> put_status(400) |> json(%{"success" => false, "error" => "Project ID is required"})

      playbook_name == "" ->
        conn |> put_status(400) |> json(%{"success" => false, "error" => "Playbook is required"})

      not is_list(selected_hosts) or selected_hosts == [] ->
        conn
        |> put_status(400)
        |> json(%{"success" => false, "error" => "At least one host must be selected"})

      true ->
        execution_data = %{
          "type" => "playbook",
          "playbookName" => playbook_name,
          "mode" => body["mode"] || "PER_GROUP",
          "inventorySnapshot" => body["inventorySnapshot"] || %{},
          "selectionSnapshot" => %{"hosts" => selected_hosts, "playbookId" => body["playbook_id"]},
          "runParams" => body["runParams"] || %{},
          "status" => "QUEUED"
        }

        execution_id = ExecutionHistory.create_execution_record(execution_data, project_id)

        json(conn, %{
          "success" => true,
          "execution_id" => execution_id,
          "project_id" => project_id,
          "status" => "QUEUED"
        })
    end
  end
end
