defmodule RadasState.Environments do
  @moduledoc """
  Context for Environment Management
  """
  import Ecto.Query, warn: false
  alias RadasState.Repo
  alias RadasState.Environment
  alias RadasState.Services.EnvironmentService
  alias RadasState.Notification
  alias RadasState.AuditLog
  alias RadasState.Jobs

  def list_environments do
    Repo.all(Environment)
  end

  def get_environment!(id), do: Repo.get!(Environment, id)

  def create_environment(attrs \\ %{}, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      name = Map.get(attrs, "name") || Map.get(attrs, :name)
      if Repo.get_by(Environment, name: name) do
        {:error, :name_taken}
      else
        result =
          %Environment{}
          |> Environment.changeset(attrs)
          |> Repo.insert()
        if match?({:ok, _}, result) do
          EnvironmentService.after_create(result)
          Notification.send(:environment_created, result)
          AuditLog.log(:create, :environment, result)
          Jobs.enqueue(:environment_created, result)
        end

        result
      end
    end
  end

  def update_environment(%Environment{} = environment, attrs, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      name = Map.get(attrs, "name") || Map.get(attrs, :name)
      cond do
        name && name != environment.name ->
          case Repo.get_by(Environment, name: name) do
            %Environment{id: id} when id != environment.id -> {:error, :name_taken}
            _ ->
              do_update_environment(environment, attrs)
          end
        true ->
          do_update_environment(environment, attrs)
      end
    end
  end

  defp do_update_environment(environment, attrs) do
    result =
      environment
      |> Environment.changeset(attrs)
      |> Repo.update()

    if match?({:ok, _}, result) do
      EnvironmentService.after_update(result)
      Notification.send(:environment_updated, result)
      AuditLog.log(:update, :environment, result)
      Jobs.enqueue(:environment_updated, result)
    end
    result
  end


  def delete_environment(%Environment{} = environment, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      result = Repo.delete(environment)

      if match?({:ok, _}, result) do
        EnvironmentService.after_delete(result)
        Notification.send(:environment_deleted, result)
        AuditLog.log(:delete, :environment, result)
        Jobs.enqueue(:environment_deleted, result)
      end
      result
    end
  end

  def change_environment(%Environment{} = environment, attrs \\ %{}) do
    Environment.changeset(environment, attrs)
  end

  defp do_update_environment(environment, attrs) do
    result =
      environment
      |> Environment.changeset(attrs)
      |> Repo.update()

    if match?({:ok, _}, result) do
      EnvironmentService.after_update(result)
      Notification.send(:environment_updated, result)
      AuditLog.log(:update, :environment, result)
      Jobs.enqueue(:environment_updated, result)
    end
    result
  end
end
