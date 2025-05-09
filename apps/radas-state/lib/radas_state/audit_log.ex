defmodule RadasState.AuditLog do
  @moduledoc """
  Audit logging stub (see plans.md)
  TODO: Implement action logging, change tracking.
  """

  @doc """
  Log an audit event with the given type and payload.
  """
  def log(event, type, payload) do
    IO.inspect({:audit_log, event, type, payload}, label: "[AuditLog]")
    :ok
  end
end
