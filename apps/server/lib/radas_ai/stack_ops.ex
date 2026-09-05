defmodule RadasAI.StackOps do
  @moduledoc """
  Port of `services/stack_ops.py` (Fase 6 — UC 347/356/374/375): stack
  operator lock (meta-based), taint/untaint via targeted tofu runs.
  """

  alias RadasAI.CloudStacks

  def is_locked(project_id, name) do
    CloudStacks.load_meta(project_id, name)["locked"] not in [nil, false]
  end

  @doc "Operator lock: stored in stack_meta.locked (reason/by/at)."
  @spec lock_stack(String.t() | nil, String.t(), String.t(), String.t()) :: map()
  def lock_stack(project_id, name, reason \\ "", actor \\ "") do
    CloudStacks.save_meta(project_id, name, %{
      "locked" => %{"reason" => reason, "by" => actor || "system", "at" => trunc(System.system_time(:second))}
    })

    %{"locked" => true, "reason" => reason, "by" => actor || "system"}
  end

  @doc "Clear the operator lock."
  @spec unlock_stack(String.t() | nil, String.t()) :: map()
  def unlock_stack(project_id, name) do
    CloudStacks.save_meta(project_id, name, %{"locked" => nil})
    %{"locked" => false}
  end

  @doc "Queue a targeted taint run (tofu apply -target=). Raises on empty address."
  @spec taint_resource(String.t() | nil, String.t(), String.t()) :: map()
  def taint_resource(project_id, name, address) do
    if address in [nil, ""], do: raise(ArgumentError, message: "address required")

    eid =
      CloudStacks.create_execution(project_id, name, "taint",
        triggered_by: "console:taint",
        extra_run_params: %{"target" => address}
      )

    %{
      "queued" => true,
      "execution_id" => eid,
      "address" => address,
      "message" => "Taint via `tofu apply -target=<address>` dijalankan worker."
    }
  end

  @doc "Queue a targeted untaint run. Raises on empty address."
  @spec untaint_resource(String.t() | nil, String.t(), String.t()) :: map()
  def untaint_resource(project_id, name, address) do
    if address in [nil, ""], do: raise(ArgumentError, message: "address required")

    eid =
      CloudStacks.create_execution(project_id, name, "untaint",
        triggered_by: "console:untaint",
        extra_run_params: %{"target" => address}
      )

    %{"queued" => true, "execution_id" => eid, "address" => address}
  end
end
