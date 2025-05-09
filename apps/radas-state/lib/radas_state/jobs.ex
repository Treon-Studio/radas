defmodule RadasState.Jobs do
  @moduledoc """
  Background job/task queue stub (see plans.md)
  TODO: Integrate with Oban or similar library.
  """

  @doc """
  Enqueue a job event with the given payload.
  """
  def enqueue(event, payload) do
    IO.inspect({:job, event, payload}, label: "[Jobs]")
    :ok
  end
end
