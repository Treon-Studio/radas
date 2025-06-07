defmodule RadasState.FeatureFlags do
  @moduledoc """
  Context for Feature Flag Management
  """
  import Ecto.Query, warn: false
  alias RadasState.Repo
  alias RadasState.FeatureFlag
  alias RadasState.Services.FeatureFlagService
  alias RadasState.Notification
  alias RadasState.AuditLog
  alias RadasState.Jobs

  def list_feature_flags do
    Repo.all(FeatureFlag)
  end

  def get_feature_flag!(id), do: Repo.get!(FeatureFlag, id)

  def create_feature_flag(attrs \\ %{}, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      # Validasi unik key
      key = Map.get(attrs, "key") || Map.get(attrs, :key)
      if Repo.get_by(FeatureFlag, key: key) do
        {:error, :key_taken}
      else
        result =
          %FeatureFlag{}
          |> FeatureFlag.changeset(attrs)
          |> Repo.insert()

        if match?({:ok, _}, result) do
          FeatureFlagService.after_create(result)
          Notification.send(:feature_flag_created, result)
          AuditLog.log(:create, :feature_flag, result)
          Jobs.enqueue(:feature_flag_created, result)
        end

        result
      end
    end
  end

  def update_feature_flag(%FeatureFlag{} = feature_flag, attrs, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      key = Map.get(attrs, "key") || Map.get(attrs, :key)
      cond do
        key && key != feature_flag.key ->
          case Repo.get_by(FeatureFlag, key: key) do
            %FeatureFlag{id: id} when id != feature_flag.id -> {:error, :key_taken}
            _ ->
              do_update_feature_flag(feature_flag, attrs)
          end
        true ->
          do_update_feature_flag(feature_flag, attrs)
      end
    end
  end

  defp do_update_feature_flag(feature_flag, attrs) do
    result =
      feature_flag
      |> FeatureFlag.changeset(attrs)
      |> Repo.update()

    if match?({:ok, _}, result) do
      FeatureFlagService.after_update(result)
      Notification.send(:feature_flag_updated, result)
      AuditLog.log(:update, :feature_flag, result)
      Jobs.enqueue(:feature_flag_updated, result)
    end
    result
  end

  def delete_feature_flag(%FeatureFlag{} = feature_flag, role \\ :user) do
    if role != :admin do
      {:error, :unauthorized}
    else
      result = Repo.delete(feature_flag)

      if match?({:ok, _}, result) do
        FeatureFlagService.after_delete(result)
        Notification.send(:feature_flag_deleted, result)
        AuditLog.log(:delete, :feature_flag, result)
        Jobs.enqueue(:feature_flag_deleted, result)
      end
      result
    end
  end

  def change_feature_flag(%FeatureFlag{} = feature_flag, attrs \\ %{}) do
    FeatureFlag.changeset(feature_flag, attrs)
  end

  defp do_update_feature_flag(feature_flag, attrs) do
    result =
      feature_flag
      |> FeatureFlag.changeset(attrs)
      |> Repo.update()

    if match?({:ok, _}, result) do
      FeatureFlagService.after_update(result)
      Notification.send(:feature_flag_updated, result)
      AuditLog.log(:update, :feature_flag, result)
      Jobs.enqueue(:feature_flag_updated, result)
    end
    result
  end
end
