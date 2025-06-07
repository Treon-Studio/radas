defmodule RadasState.Services.KnowledgeService do
  @moduledoc """
  Business logic for Knowledge (Notes)
  Handles post-processing after core DB operations, such as triggering notifications, audit logs, jobs, or other business rules.
  """

  @doc """
  Called after a note is created. Receives {:ok, %Knowledge{}} or {:error, _}.
  Extend this function to add custom business logic, notifications, etc.
  """
  def after_create({:ok, note}) do
    # TODO: Add custom logic, e.g., enrich note, trigger more notifications, etc.
    :ok
  end
  def after_create(_), do: :ok

  @doc """
  Called after a note is updated. Receives {:ok, %Knowledge{}} or {:error, _}.
  Extend this function to add custom business logic, notifications, etc.
  """
  def after_update({:ok, note}) do
    # TODO: Add custom logic for update
    :ok
  end
  def after_update(_), do: :ok

  @doc """
  Called after a note is deleted. Receives {:ok, %Knowledge{}} or {:error, _}.
  Extend this function to add custom business logic, notifications, etc.
  """
  def after_delete({:ok, note}) do
    # TODO: Add custom logic for delete
    :ok
  end
  def after_delete(_), do: :ok
end
