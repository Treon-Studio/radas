defmodule RadasStateWeb.ProjectStatusJSON do
  def index(%{project_statuses: project_statuses}) do
    %{data: Enum.map(project_statuses, &project_status/1)}
  end

  def show(%{project_status: project_status}) do
    %{data: project_status(project_status)}
  end

  defp project_status(status) do
    %{
      id: status.id,
      name: status.name,
      status: status.status,
      description: status.description,
      inserted_at: status.inserted_at,
      updated_at: status.updated_at
    }
  end
end
