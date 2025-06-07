defmodule RadasState.Notification do
  @moduledoc """
  Notification system stub (see plans.md)
  TODO: Implement email, in-app, and webhook notifications.
  """
  # Example: Swoosh, Phoenix.PubSub, etc.

  @doc """
  Send a notification event with the given payload.
  """
  def send(event, payload) do
    IO.inspect({:notification, event, payload}, label: "[Notification]")
    :ok
  end
end
