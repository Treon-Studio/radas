defmodule RadasState.Services.FeatureFlagService do
  @moduledoc """
  Business logic for Feature Flag System
  """

  alias RadasState.Notification
  alias RadasState.AuditLog
  alias RadasState.Jobs

  @doc """
  Called after a feature flag is created.
  """
  def after_create({:ok, feature_flag}) do
    Notification.send(:feature_flag_created, feature_flag)
    AuditLog.log(:create, :feature_flag, feature_flag)
    Jobs.enqueue(:feature_flag_created, feature_flag)
    :ok
  end
  def after_create(_), do: :noop

  @doc """
  Called after a feature flag is updated.
  """
  def after_update({:ok, feature_flag}) do
    Notification.send(:feature_flag_updated, feature_flag)
    AuditLog.log(:update, :feature_flag, feature_flag)
    Jobs.enqueue(:feature_flag_updated, feature_flag)
    :ok
  end
  def after_update(_), do: :noop

  @doc """
  Called after a feature flag is deleted.
  """
  def after_delete({:ok, feature_flag}) do
    Notification.send(:feature_flag_deleted, feature_flag)
    AuditLog.log(:delete, :feature_flag, feature_flag)
    Jobs.enqueue(:feature_flag_deleted, feature_flag)
    :ok
  end
  def after_delete(_), do: :noop
end
