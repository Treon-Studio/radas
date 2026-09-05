defmodule RadasAI.LockLifecycle do
  @moduledoc """
  Port of `services/lock_lifecycle.py` — execution-scoped lock lifecycle
  (UC373 project + UC331 remote state). Lock IDs travel on the execution
  record (runParams["lock_ids"]) so terminal paths release by lease id.
  """

  alias RadasAI.{ProjectLock, RemoteStateLock}

  @remote_key_fallback "cloud-provisioning/{stack}.tfstate"

  @doc """
  Acquire the project lock and (for remote backends) the remote-state lock.
  Returns {"project" => result, "remote" => result | nil}; the remote lock
  is not attempted when the project lock fails.
  """
  @spec acquire_for_execution(String.t(), String.t(), String.t(), keyword()) :: map()
  def acquire_for_execution(project_id, stack, action, opts \\ []) do
    actor = Keyword.get(opts, :actor, "")
    run_id = Keyword.get(opts, :run_id)
    backend_config = Keyword.get(opts, :backend_config) || %{}

    project = ProjectLock.acquire(project_id, actor: actor, operation: action, run_id: run_id)

    unless project["ok"] do
      %{"project" => project, "remote" => nil}
    else
      backend_type = backend_config["backend_type"]

      remote =
        if backend_type in [nil, "", "local"] do
          nil
        else
          backend_key =
            get_in(backend_config, ["values", "key"]) ||
              String.replace(@remote_key_fallback, "{stack}", stack)

          RemoteStateLock.acquire(stack, to_string(backend_type), backend_key,
            actor: actor,
            operation: action,
            run_id: run_id
          )
        end

      %{"project" => project, "remote" => remote}
    end
  end

  @doc "Release locks from acquire_for_execution (enqueue-failure path); returns the count."
  @spec release_for_acquisition(map(), keyword()) :: integer()
  def release_for_acquisition(acquisition, opts \\ []) do
    _stack = Keyword.get(opts, :stack)
    project_id = Keyword.get(opts, :project_id)
    acquisition = acquisition || %{}
    released = 0

    released =
      case acquisition["project"] do
        %{"ok" => true, "lock" => %{"id" => id}} ->
          result = ProjectLock.release(project_id, lock_id: id, force: true)
          if result["released"], do: released + 1, else: released

        _ ->
          released
      end

    case acquisition["remote"] do
      %{"ok" => true, "lock" => lock} ->
        result =
          RemoteStateLock.release(lock["stack"], lock["backend_type"], lock["backend_key"],
            lock_id: lock["id"],
            force: true
          )

        if result["released"], do: released + 1, else: released

      _ ->
        released
    end
  end

  @doc "Project the acquisition onto the stable runParams[\"lock_ids\"] shape."
  @spec lock_ids_from_acquisition(map() | nil) :: map()
  def lock_ids_from_acquisition(acquisition) do
    acquisition = acquisition || %{}
    ids = %{}

    ids =
      case acquisition["project"] do
        %{"ok" => true, "lock" => %{"id" => id}} -> Map.put(ids, "project_lock_id", id)
        _ -> ids
      end

    case acquisition["remote"] do
      %{"ok" => true, "lock" => lock} ->
        ids
        |> Map.put("remote_state_lock_id", lock["id"])
        |> Map.put("remote_state", %{
          "stack" => lock["stack"],
          "backend_type" => lock["backend_type"],
          "backend_key" => lock["backend_key"]
        })

      _ ->
        ids
    end
  end
end
