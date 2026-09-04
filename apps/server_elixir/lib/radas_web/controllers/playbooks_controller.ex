defmodule RadasWeb.PlaybooksController do
  @moduledoc """
  Port of the core playbook routes from `api/playbooks_routes.py`:
  list/create/get/update/delete + yaml save. The run path (POST
  /api/run_ansible) stays on Flask during coexistence — it builds the
  ansible-playbook command; Elixir creates the shared QUEUED execution
  record so the Go worker protocol works unchanged.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.{ExecutionHistory, Playbooks}

  defp project_id(conn, params \\ %{}), do: params["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

  # -- list / create ---------------------------------------------------------------

  def list(conn, %{"project_id" => project_id}) do
    json(conn, %{"success" => true, "playbooks" => Playbooks.list_playbooks(project_id)})
  end

  def create(conn, %{"project_id" => project_id}) do
    data = conn.body_params || %{}
    name = String.trim(to_string(data["name"] || ""))

    cond do
      name == "" ->
        conn |> put_status(400) |> json(%{"success" => false, "error" => "Playbook name is required"})

      Playbooks.check_name_conflict(project_id, name) ->
        conn |> put_status(409) |> json(%{"success" => false, "error" => ~s(Playbook with name "#{name}" already exists)})

      true ->
        playbook = Playbooks.create_playbook(project_id, name, String.trim(to_string(data["description"] || "")))
        conn |> put_status(201) |> json(%{"success" => true, "playbook" => playbook})
    end
  end

  # -- get / update / delete -----------------------------------------------------------

  def show(conn, %{"project_id" => project_id, "playbook_id" => playbook_id}) do
    case Playbooks.get_playbook(project_id, playbook_id) do
      nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Playbook not found"})
      playbook -> json(conn, %{"success" => true, "playbook" => playbook})
    end
  end

  def update(conn, %{"project_id" => project_id, "playbook_id" => playbook_id}) do
    data = conn.body_params || %{}

    if Playbooks.get_playbook(project_id, playbook_id) == nil do
      conn |> put_status(404) |> json(%{"success" => false, "error" => "Playbook not found"})
    else
      if data["name"] != nil and String.trim(to_string(data["name"])) == "" do
        conn |> put_status(400) |> json(%{"success" => false, "error" => "Playbook name cannot be empty"})
      else
        new_name = if data["name"] != nil, do: String.trim(to_string(data["name"]))

        if new_name && Playbooks.check_name_conflict(project_id, new_name, playbook_id) do
          conn |> put_status(409) |> json(%{"success" => false, "error" => ~s(Playbook with name "#{new_name}" already exists)})
        else
          case Playbooks.update_playbook(project_id, playbook_id, data) do
            nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Playbook not found"})
            playbook -> json(conn, %{"success" => true, "playbook" => playbook})
          end
        end
      end
    end
  end

  def delete(conn, %{"project_id" => project_id, "playbook_id" => playbook_id}) do
    json(conn, %{"success" => Playbooks.delete_playbook(project_id, playbook_id)})
  end

  # -- repo yaml ---------------------------------------------------------------------

  def yaml_save(conn, %{"project_id" => project_id}) do
    data = conn.body_params || %{}
    name = String.trim(to_string(data["name"] || ""))
    content = to_string(data["content"] || "")

    if name == "" or content == "" do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "name and content are required"})
    else
      Playbooks.save_repo_yaml(project_id, name, content)
      json(conn, %{"success" => true})
    end
  end
end
