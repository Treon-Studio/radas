defmodule RadasStateWeb.ProjectStatusController do
  use RadasStateWeb, :controller
  alias RadasState.ProjectStatuses

  def index(conn, _params) do
    project_statuses = ProjectStatuses.list_project_statuses()
    render(conn, "index.json", project_statuses: project_statuses)
  end

  def show(conn, %{"id" => id}) do
    project_status = ProjectStatuses.get_project_status!(id)
    render(conn, "show.json", project_status: project_status)
  end

  def create(conn, %{"project_status" => project_status_params}) do
    with {:ok, project_status} <- ProjectStatuses.create_project_status(project_status_params) do
      conn
      |> put_status(:created)
      |> render("show.json", project_status: project_status)
    end
  end

  def update(conn, %{"id" => id, "project_status" => project_status_params}) do
    project_status = ProjectStatuses.get_project_status!(id)
    with {:ok, project_status} <- ProjectStatuses.update_project_status(project_status, project_status_params) do
      render(conn, "show.json", project_status: project_status)
    end
  end

  def delete(conn, %{"id" => id}) do
    project_status = ProjectStatuses.get_project_status!(id)
    with {:ok, _} <- ProjectStatuses.delete_project_status(project_status) do
      send_resp(conn, :no_content, "")
    end
  end
end
