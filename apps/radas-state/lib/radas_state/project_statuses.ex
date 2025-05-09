defmodule RadasState.ProjectStatuses do
  @moduledoc """
  Context for Project Status Management
  """
  import Ecto.Query, warn: false
  alias RadasState.Repo
  alias RadasState.ProjectStatus
  alias RadasState.Services.ProjectStatusService
  alias RadasState.Notification
  alias RadasState.AuditLog
  alias RadasState.Jobs

  def list_project_statuses do
    Repo.all(ProjectStatus)
  end

  def get_project_status!(id), do: Repo.get!(ProjectStatus, id)

  def create_project_status(attrs \\ %{}, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      # Validasi unik name
      name = Map.get(attrs, "name") || Map.get(attrs, :name)
      if Repo.get_by(ProjectStatus, name: name) do
        {:error, :name_taken}
      else
        result =
          %ProjectStatus{}
          |> ProjectStatus.changeset(attrs)
          |> Repo.insert()

        if match?({:ok, _}, result) do
          ProjectStatusService.after_create(result)
          Notification.send(:project_status_created, result)
          AuditLog.log(:create, :project_status, result)
          Jobs.enqueue(:project_status_created, result)
        end

        result
      end
    end
  end

  def update_project_status(%ProjectStatus{} = project_status, attrs, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      name = Map.get(attrs, "name") || Map.get(attrs, :name)
      cond do
        name && name != project_status.name ->
          case Repo.get_by(ProjectStatus, name: name) do
            %ProjectStatus{id: id} when id != project_status.id -> {:error, :name_taken}
            _ ->
              do_update_project_status(project_status, attrs)
          end
        true ->
          do_update_project_status(project_status, attrs)
      end
    end
  end

  defp do_update_project_status(project_status, attrs) do
    result =
      project_status
      |> ProjectStatus.changeset(attrs)
      |> Repo.update()

    if match?({:ok, _}, result) do
      ProjectStatusService.after_update(result)
      Notification.send(:project_status_updated, result)
      AuditLog.log(:update, :project_status, result)
      Jobs.enqueue(:project_status_updated, result)
    end
    result
  end

  def delete_project_status(%ProjectStatus{} = project_status, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      result = Repo.delete(project_status)

      if match?({:ok, _}, result) do
        ProjectStatusService.after_delete(result)
        Notification.send(:project_status_deleted, result)
        AuditLog.log(:delete, :project_status, result)
        Jobs.enqueue(:project_status_deleted, result)
      end
      result
    end
  end

  def change_project_status(%ProjectStatus{} = project_status, attrs \\ %{}) do
    ProjectStatus.changeset(project_status, attrs)
  end
end
