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

  alias RadasAI.{ExecutionHistory, Templates}

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
