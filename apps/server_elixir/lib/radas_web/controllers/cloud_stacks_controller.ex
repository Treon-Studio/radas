defmodule RadasWeb.CloudStacksController do
  @moduledoc """
  Port of the stack CRUD slice of `api_v2/cloud_stack_routes.py` +
  `services/cloud_provisioning.py::stacks_*`: list/create/show/update/delete
  stacks under `/api/v2/cloud/stacks` with auth via `RadasWeb.Plugs.Auth`.
  State routes (overview/lock/versions) delegate to `RadasAI.CloudState`
  (Python services/cloud_state.py route table).

  Runtime bodies mirror the v1 handlers (the platform plug normalizes
  ≥400 responses into the error envelope): create/update → `{"ok", "name"}`
  (create 201), delete → exactly `{"ok": true}`, show → the StackDetail map.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.AuditEvents
  alias RadasAI.CloudProviders
  alias RadasAI.CloudStacks
  alias RadasAI.CloudState
  alias RadasAI.LockLifecycle
  alias RadasAI.StackOps
  alias RadasWeb.Plugs.OrgAccess

  @valid_actions MapSet.new([
                   "init",
                   "plan",
                   "apply",
                   "destroy",
                   "validate",
                   "fmt",
                   "refresh",
                   "drift",
                   "test",
                   "lock",
                   "unlock",
                   "taint",
                   "untaint",
                   "force-unlock"
                 ])

  @mutating_actions MapSet.new(["apply", "destroy", "refresh"])

  defp project_id(conn, body \\ %{}),
    do: body["project_id"] || get_req_header(conn, "x-project-id") |> List.first()

  # Python @require_project_access: org-membership gate on the resolved
  # project. Runs after the Auth plug; errors mirror the Python jsonify
  # bodies (the platform plug normalizes them into the error envelope).
  defp with_project_access(conn, project_id, fun) do
    case OrgAccess.ensure_project_access(conn, project_id) do
      :ok -> fun.()
      {:error, status, body} -> conn |> put_status(status) |> json(body)
    end
  end

  # -- list / create ------------------------------------------------------------

  def list(conn, _params) do
    with_project_access(conn, project_id(conn), fn ->
      json(conn, %{"stacks" => CloudStacks.list_stacks(project_id(conn))})
    end)
  end

  def create(conn, _params) do
    body = conn.body_params || %{}
    project_id = project_id(conn, body)

    with_project_access(conn, project_id, fn ->
      case CloudStacks.create_stack(project_id, body["name"], body["provider"] || "bytedc", body["values"] || %{}) do
        {:ok, name} -> conn |> put_status(201) |> json(%{"ok" => true, "name" => name})
        {:error, status, msg} -> conn |> put_status(status) |> json(%{"error" => msg})
      end
    end)
  end

  # -- show / update / delete -----------------------------------------------------

  def show(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      sd = CloudStacks.stack_dir(project_id, name)

      if not CloudStacks.valid_name?(name) or not File.dir?(sd) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        json(conn, CloudStacks.stack_detail(project_id, name))
      end
    end)
  end

  def update(conn, %{"name" => name}) do
    body = conn.body_params || %{}
    project_id = project_id(conn, body)

    with_project_access(conn, project_id, fn ->
      case CloudStacks.update_stack_values(project_id, name, body["values"] || %{}) do
        {:ok, name} -> json(conn, %{"ok" => true, "name" => name})
        {:error, status, msg} -> conn |> put_status(status) |> json(%{"error" => msg})
      end
    end)
  end

  def delete(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      force = conn.query_params["force"] in ["1", "true", "yes"]

      case CloudStacks.delete_stack(project_id, name, force) do
        {:ok, true} -> json(conn, %{"ok" => true})
        {:error, status, msg} -> conn |> put_status(status) |> json(%{"error" => msg})
      end
    end)
  end

  # -- actions (Python stacks_action: tofu lifecycle → worker queue) --------------

  def stack_action(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      sd = CloudStacks.stack_dir(project_id, name)

      if not CloudStacks.valid_name?(name) or not File.dir?(sd) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        run_action(conn, project_id, name, sd)
      end
    end)
  end

  defp run_action(conn, project_id, name, sd) do
    body = conn.body_params || %{}
    user = conn.assigns[:current_user] || %{}
    action = body["action"] |> to_string() |> String.trim() |> String.downcase()

    cond do
      action not in @valid_actions ->
        conn
        |> put_status(400)
        |> json(%{"error" => "Unsupported action. Allowed: #{inspect(MapSet.to_list(@valid_actions) |> Enum.sort())}"})

      action == "drift" and CloudStacks.load_meta(project_id, name)["drift_enabled"] != true ->
        conn
        |> put_status(409)
        |> json(%{
          "error" =>
            "Drift detection is disabled for this stack. Enable it in the stack's Drift detection panel first."
        })

      action == "lock" ->
        reason = String.trim(to_string(body["reason"] || "manual"))
        json(conn, Map.merge(%{"ok" => true}, StackOps.lock_stack(project_id, name, reason, actor_name(user))))

      action == "unlock" ->
        json(conn, Map.merge(%{"ok" => true}, StackOps.unlock_stack(project_id, name)))

      action == "force-unlock" ->
        conn
        |> put_status(400)
        |> json(%{"error" => "force-unlock is not supported via actions; use the state lock endpoint"})

      action in ["taint", "untaint"] ->
        run_taint(conn, project_id, name, action, String.trim(to_string(body["address"] || "")))

      true ->
        run_lifecycle(conn, project_id, name, sd, action, body, user)
    end
  end

  defp run_taint(conn, project_id, name, action, address) do
    if address == "" do
      conn |> put_status(400) |> json(%{"error" => "address required"})
    else
      fn_to_run = if action == "taint", do: &StackOps.taint_resource/3, else: &StackOps.untaint_resource/3

      try do
        json(conn, Map.merge(%{"ok" => true}, fn_to_run.(project_id, name, address)))
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"error" => e.message})
      end
    end
  end

  defp run_lifecycle(conn, project_id, name, sd, action, body, user) do
    mutating = MapSet.member?(@mutating_actions, action)
    dd = CloudStacks.stack_data_dir(project_id, name)
    actor = actor_name(user)
    actor_id = user["user_id"] || ""
    org_id = if project_id, do: org_id_of_project(project_id)

    # 1. Operator lock outranks automation kill-switches.
    if mutating and StackOps.is_locked(project_id, name) do
      reason = (CloudStacks.load_meta(project_id, name)["locked"] || %{})["reason"] || ""

      conn
      |> put_status(423)
      |> json(%{"error" => "Stack is locked" <> if(reason != "", do: " (#{reason})", else: "") <> ". Unlock before mutating."})
    else
      # 2. Safety flag gate (mutation_blocked + per-action kill switches).
      with_flag_gate(conn, action, project_id, name, org_id, user, fn ->
        # 3. Role-per-environment gate.
        with_env_roles(conn, project_id, CloudStacks.load_meta(project_id, name)["env"], user, fn ->
          # 4. Stack-level state lock.
          with_state_unlocked(conn, mutating, dd, project_id, fn ->
            # 5. Project + remote lock acquisition.
            with_execution_locks(conn, mutating, project_id, name, sd, action, actor, fn lock_ids ->
              enqueue_run(conn, project_id, name, sd, dd, %{
                action: action,
                mutating: mutating,
                actor: actor,
                actor_id: actor_id,
                worker_id: target_worker(body),
                priority: parse_priority(body),
                lock_ids: lock_ids
              })
            end)
          end)
        end)
      end)
    end
  end

  defp with_flag_gate(conn, action, project_id, name, org_id, user, fun) do
    if MapSet.member?(@mutating_actions, action) do
      env = CloudStacks.load_meta(project_id, name)["env"] || "prod"
      user_name = actor_name(user)
      gate_key = if action == "destroy", do: "block_destroy", else: "block_apply"

      gate =
        RadasAI.Flags.evaluate_scoped(gate_key, env: env, user: user_name, project_id: project_id, org_id: org_id)

      if gate["enabled"] do
        conn
        |> put_status(423)
        |> json(%{"error" => "Operation blocked by safety flag (#{gate["reason"]}).", "flag" => gate})
      else
        keys = [
          "safety.cloud.apply.block",
          "safety.cloud.destroy.block",
          "safety.cloud.refresh.block",
          "stack.#{name}.block_apply"
        ]

        blocked =
          Enum.find(keys, fn key ->
            res =
              RadasAI.Flags.evaluate_scoped(key, env: env, user: user_name, project_id: project_id, org_id: org_id)

            res["enabled"] == true
          end)

        if blocked do
          res =
            RadasAI.Flags.evaluate_scoped(blocked, env: env, user: user_name, project_id: project_id, org_id: org_id)

          conn
          |> put_status(423)
          |> json(%{"error" => "Operation blocked by feature flag '#{blocked}' (#{res["reason"]}).", "flag" => res})
        else
          fun.()
        end
      end
    else
      fun.()
    end
  end

  defp with_env_roles(conn, project_id, env, user, fun) do
    roles = user["roles"] || []

    if RadasAI.EnvRoles.allowed(project_id, env, roles) do
      fun.()
    else
      conn
      |> put_status(403)
      |> json(%{"error" => "Role not allowed to act on environment '#{env}'."})
    end
  end

  defp with_state_unlocked(conn, mutating, dd, project_id, fun) do
    existing =
      if mutating, do: CloudState.read_lock(dd, &RadasAI.Executions.get_execution/2, project_id), else: nil

    if existing do
      conn
      |> put_status(409)
      |> json(%{
        "error" =>
          "State is locked by #{existing["who"]} (#{existing["operation"]}). Wait for that run to finish, " <>
            "or force-unlock from the State management panel.",
        "lock" => existing
      })
    else
      fun.()
    end
  end

  defp with_execution_locks(conn, mutating, project_id, name, sd, action, actor, fun) do
    if not mutating do
      fun.(nil)
    else
      bc = CloudState.read_backend_config(sd)

      acquisition =
        LockLifecycle.acquire_for_execution(project_id, name, action,
          actor: actor || "unknown",
          backend_config: bc
        )

      proj = acquisition["project"] || %{}

      cond do
        not proj["ok"] ->
          lock = proj["lock"]

          conn
          |> put_status(409)
          |> json(%{
            "error" =>
              "Project is locked by #{lock && lock["actor"]} (#{lock && lock["operation"]}). Wait for that run to finish or force-unlock from the State management panel.",
            "lock" => lock
          })

        acquisition["remote"] && not acquisition["remote"]["ok"] ->
          lock = acquisition["remote"]["lock"]
          LockLifecycle.release_for_acquisition(acquisition, stack: name, project_id: project_id)

          conn
          |> put_status(409)
          |> json(%{
            "error" =>
              "Remote state is locked by #{lock["actor"]} (#{lock["operation"]}) for #{lock["stack"]}. " <>
                "Wait for that run to finish or force-unlock.",
            "lock" => lock
          })

        true ->
          fun.(LockLifecycle.lock_ids_from_acquisition(acquisition))
      end
    end
  end

  defp enqueue_run(conn, project_id, name, sd, dd, cfg) do
    action = cfg.action

    try do
      eid =
        CloudStacks.create_execution(project_id, name, action,
          worker_id: cfg.worker_id,
          triggered_by: cfg.actor,
          triggered_by_user_id: cfg.actor_id,
          priority: cfg.priority,
          extra_run_params: (cfg.mutating && cfg.lock_ids && %{"lock_ids" => cfg.lock_ids}) || nil
        )

      if cfg.mutating do
        CloudState.snapshot_state(sd, dd, actor: cfg.actor || "unknown", reason: "pre-#{action}", run_id: eid)
        CloudState.acquire_lock(dd,
          actor: cfg.actor || "unknown",
          operation: action,
          run_id: eid,
          get_execution: &RadasAI.Executions.get_execution/2,
          project_id: project_id
        )
      end

      CloudState.append_audit(dd, "run.queued", cfg.actor || "unknown", %{action: action, run_id: eid})

      CloudStacks.save_meta(project_id, name, %{
        "last_action" => action,
        "last_status" => "queued",
        "last_run_id" => eid
      })

      AuditEvents.record_audit_event("cloud.run.queued",
        actor_user_id: (cfg.actor_id != "" && cfg.actor_id) || nil,
        target_type: "execution",
        target_id: eid,
        meta: %{
          "project_id" => project_id,
          "stack_name" => name,
          "tofu_action" => action,
          "provider" => CloudStacks.load_meta(project_id, name)["provider"],
          "triggered_by" => cfg.actor,
          "worker_id" => cfg.worker_id,
          "actor_kind" => (cfg.actor_id != "" && "user") || "system"
        }
      )

      conn
      |> put_status(202)
      |> json(%{
        "ok" => true,
        "run_id" => eid,
        "execution_id" => eid,
        "project_id" => project_id || "default",
        "status" => "queued",
        "message" => "Queued. Waiting for a worker to claim this run."
      })
    rescue
      e ->
        conn |> put_status(500) |> json(%{"error" => "Failed to queue run: #{Exception.message(e)}"})
    end
  end

  defp actor_name(user),
    do: user["username"] || user["email"] || user["user_id"] || ""

  defp target_worker(body) do
    w = String.trim(to_string(body["worker_id"] || body["target_worker_id"] || ""))
    if w == "", do: nil, else: w
  end

  defp parse_priority(body) do
    case Integer.parse(to_string(body["priority"] || "0")) do
      {n, _} -> n
      :error -> 0
    end
  end

  defp org_id_of_project(project_id) do
    import RadasAI.DB
    case RadasAI.DB.query_one!("SELECT org_id FROM projects WHERE id = $1", [project_id]) do
      %{"org_id" => org_id} -> org_id
      nil -> nil
    end
  rescue
    _ -> nil
  end

  # -- providers / schemas (Python list_providers / *_schema) ----------------------

  def providers_list(conn, _params) do
    with_project_access(conn, project_id(conn), fn ->
      json(conn, %{"providers" => CloudProviders.catalog()})
    end)
  end

  # Legacy alias kept for the older wizard frontend (Python bytedc_schema).
  def bytedc_schema(conn, _params), do: json(conn, CloudProviders.schema("bytedc"))

  def provider_schema(conn, %{"provider" => provider}) do
    with_project_access(conn, project_id(conn), fn ->
      case CloudProviders.schema(provider) do
        nil -> conn |> put_status(404) |> json(%{"error" => "Unknown provider '#{provider}'."})
        schema -> json(conn, schema)
      end
    end)
  end

  # -- drift (Python drift_get / drift_set) ------------------------------------------

  def drift_get(conn, %{"name" => name}) do
    with_pid(conn, name, fn project_id, _sd, _dd ->
      json(conn, CloudStacks.drift_status(project_id, name))
    end)
  end

  def drift_set(conn, %{"name" => name}) do
    with_pid(conn, name, fn project_id, _sd, _dd ->
      body = conn.body_params || %{}
      enabled = body["enabled"]

      enabled =
        if is_binary(enabled) do
          String.trim(String.downcase(enabled)) in ["1", "true", "yes", "on"]
        else
          enabled
        end

      if not is_boolean(enabled) do
        conn |> put_status(400) |> json(%{"error" => "Body must include boolean 'enabled'."})
      else
        CloudStacks.save_meta(project_id, name, %{"drift_enabled" => enabled})
        json(conn, Map.merge(%{"ok" => true}, CloudStacks.drift_status(project_id, name)))
      end
    end)
  end

  # -- runs (Python runs_list / run_get / run_stream) ----------------------------------

  def runs_list(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      if not CloudStacks.valid_name?(name) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        json(conn, %{"runs" => CloudStacks.stack_runs(project_id, name)})
      end
    end)
  end

  def run_get(conn, %{"name" => name, "run_id" => run_id}) do
    project_id = project_id(conn, conn.query_params) || "default"

    with_project_access(conn, project_id, fn ->
      if not CloudStacks.valid_name?(name) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        case CloudStacks.run_detail(project_id, name, run_id) do
          nil -> conn |> put_status(404) |> json(%{"error" => "Run not found"})
          run -> json(conn, run)
        end
      end
    end)
  end

  def run_stream(conn, %{"name" => name, "run_id" => run_id}) do
    project_id = project_id(conn, conn.query_params) || "default"

    with_project_access(conn, project_id, fn ->
      if not CloudStacks.valid_name?(name) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        case RadasAI.Executions.get_execution(run_id, project_id) do
          nil ->
            conn |> put_status(404) |> json(%{"error" => "Run not found"})

          exe ->
            stream_run_log(conn, project_id, name, run_id, String.upcase(to_string(exe["status"] || "")))
        end
      end
    end)
  end

  defp stream_run_log(conn, project_id, _name, run_id, initial_status) do
    final = MapSet.new(["SUCCESS", "FAILED", "CANCELED", "ERROR", "TIMEOUT", "STALLED"])

    stream =
      Stream.resource(
        fn -> {0, 0, initial_status} end,
        fn
          {_offset, empty, _status} when empty >= 120 ->
            {:halt, nil}

          {offset, empty, _status} ->
            {text, next_offset, _size, complete} =
              RadasAI.Executions.read_log_chunk(run_id, offset, 1024 * 1024, project_id)

            status =
              RadasAI.Executions.get_execution(run_id, project_id)
              |> then(&(String.upcase(to_string((if &1, do: &1["status"], else: "") || ""))))

            frames =
              if text != "" do
                text
                |> String.split("\n", trim: false)
                |> Enum.reject(&(&1 == ""))
                |> Enum.map(&"data: #{String.replace_suffix(&1, "\r", "")}\n\n")
              else
                []
              end

            cond do
              frames != [] ->
                {frames, {next_offset, 0, status}}

              complete ->
                {["event: end\ndata: #{CloudStacks.ui_status(status)}\n\n"], {next_offset, 0, status}}

              true ->
                {[": waiting for worker\n\n"], {offset, empty + 1, status}}
            end

          nil ->
            {:halt, nil}
        end,
        fn _ -> :ok end
      )

    conn = put_resp_content_type(conn, "text/event-stream")
    conn = put_resp_header(conn, "cache-control", "no-cache")
    conn = send_chunked(conn, 200)

    Enum.reduce_while(stream, conn, fn frame, acc ->
      case chunk(acc, frame) do
        {:ok, acc} -> {:cont, acc}
        {:error, _} -> {:halt, acc}
      end
    end)
  end

  # -- state inspect (Python stacks_state) ----------------------------------------------

  def state_inspect(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, sd, _dd ->
      sf = Path.join(sd, "terraform.tfstate")

      if not File.exists?(sf) do
        json(conn, %{
          "state_present" => false,
          "resource_count" => 0,
          "resources" => [],
          "message" =>
            "No terraform.tfstate on disk. The local state was never written or has been removed (e.g. data volume not persisted)."
        })
      else
        case Jason.decode(File.read!(sf)) do
          {:ok, state} when is_map(state) ->
            addresses = state_resource_addresses(state)

            json(conn, %{
              "state_present" => true,
              "resource_count" => length(addresses),
              "resources" => addresses,
              "serial" => state["serial"],
              "lineage" => state["lineage"],
              "tofu_version" => state["terraform_version"]
            })

          _ ->
            json(conn, %{"state_present" => true, "resource_count" => 0, "resources" => [], "error" => "state file unreadable"})
        end
      end
    end)
  end

  defp state_resource_addresses(state) do
    Enum.flat_map(state["resources"] || [], fn res ->
      module = res["module"] || ""
      rtype = res["type"] || ""
      rname = res["name"] || ""

      Enum.map(res["instances"] || [], fn inst ->
        suffix =
          case inst["index_key"] do
            k when is_binary(k) -> "[\"#{k}\"]"
            k when is_integer(k) -> "[#{k}]"
            _ -> ""
          end

        base = "#{rtype}.#{rname}#{suffix}"
        if module == "", do: base, else: "#{module}.#{base}"
      end)
    end)
  end

  # -- force-unlock (Python api_force_unlock_stack, UC523) --------------------------------

  def force_unlock(conn, %{"name" => name}) do
    project_id = project_id(conn, conn.body_params)

    with_project_access(conn, project_id, fn ->
      body = conn.body_params || %{}
      lock_id = body["lock_id"] || body["lockId"] || ""
      user = conn.assigns[:current_user] || %{}
      actor = user["username"] || user["email"] || "admin"

      if not CloudStacks.valid_name?(name) or String.trim(to_string(lock_id)) == "" do
        conn |> put_status(400) |> json(%{"error" => "lock_id required"})
      else
        lock_id = to_string(lock_id)
        now = System.system_time(:second)
        meta = CloudStacks.load_meta(project_id, name)

        history =
          List.wrap(meta["unlock_history"]) ++
            [%{"lock_id" => lock_id, "unlocked_by" => actor, "unlocked_at" => now, "success" => true}]

        CloudStacks.save_meta(project_id, name, %{"unlock_history" => history})

        RadasAI.AuditEvents.record_audit_event("state.force_unlock",
          actor_user_id: user["user_id"],
          target_type: "stack",
          target_id: name,
          meta: %{"project_id" => project_id, "lock_id" => lock_id}
        )

        json(conn, %{
          "ok" => true,
          "stack" => name,
          "project_id" => project_id,
          "lock_id" => lock_id,
          "unlocked_at" => now,
          "message" => "State lock '#{lock_id}' successfully released."
        })
      end
    end)
  end

  # -- state versions detail / rollback / audit / backend (cloud_state.py routes) -------

  @version_id_re ~r|^[A-Za-z0-9._-]+$|

  def state_version_get(conn, %{"name" => name, "version_id" => version_id}) do
    with_pid(conn, name, fn _project_id, _sd, dd ->
      if not Regex.match?(@version_id_re, version_id) do
        conn |> put_status(400) |> json(%{"error" => "Invalid version id"})
      else
        path = Path.join([dd, "state-versions", version_id <> ".json"])

        if not File.exists?(path) do
          conn |> put_status(404) |> json(%{"error" => "Version not found"})
        else
          raw = File.read!(path)

          if conn.query_params["download"] in ["1", "true", "yes"] do
            RadasAI.CloudState.append_audit(dd, "state.downloaded", actor_name(conn.assigns[:current_user] || %{}), %{version_id: version_id})

            conn
            |> put_resp_header("content-disposition", "attachment; filename=\"#{name}-#{version_id}.tfstate.json\"")
            |> put_resp_content_type("application/json")
            |> send_resp(200, raw)
          else
            state =
              case String.trim(raw) |> Jason.decode() do
                {:ok, decoded} -> decoded
                _ -> %{}
              end

            json(
              conn,
              Map.merge(
                %{"id" => version_id, "state" => state},
                CloudState.summarize_state(raw)
              )
            )
          end
        end
      end
    end)
  end

  def state_version_rollback(conn, %{"name" => name, "version_id" => version_id}) do
    with_pid(conn, name, fn project_id, sd, dd ->
      body = conn.body_params || %{}

      if String.trim(to_string(body["confirm"] || "")) != name do
        conn
        |> put_status(400)
        |> json(%{"error" => "Type the stack name \"#{name}\" in \"confirm\" to roll back state."})
      else
        lock = CloudState.read_lock(dd, &RadasAI.Executions.get_execution/2, project_id)

        if lock do
          conn
          |> put_status(409)
          |> json(%{"error" => "Stack state is locked — a run is in progress.", "lock" => lock})
        else
          res =
            CloudState.rollback_state(sd, dd, version_id,
              actor: actor_name(conn.assigns[:current_user] || %{})
            )

          if res["ok"] do
            json(
              conn,
              Map.put(res, "warning", "State was restored, but no cloud resources changed. Run a plan now to reconcile the restored state with reality.")
            )
          else
            conn |> put_status(400) |> json(res)
          end
        end
      end
    end)
  end

  def state_audit(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, _sd, dd ->
      limit =
        case Integer.parse(conn.query_params["limit"] || "100") do
          {n, _} -> max(1, min(n, 500))
          :error -> 100
        end

      entries = CloudState.read_audit(dd, limit)
      json(conn, %{"entries" => entries, "count" => length(entries)})
    end)
  end

  def state_backend_get(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, sd, _dd ->
      json(conn, CloudState.read_backend_config(sd))
    end)
  end

  def state_backend_put(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, sd, dd ->
      body = conn.body_params || %{}
      values = if is_map(body["values"]), do: body["values"], else: body

      res =
        CloudState.write_backend_config(sd, dd, values, actor: actor_name(conn.assigns[:current_user] || %{}))

      if res["ok"] do
        json(
          conn,
          Map.put(res, "message", "backend.hcl updated. Run `init` so OpenTofu picks up the new backend.")
        )
      else
        conn |> put_status(400) |> json(res)
      end
    end)
  end

  # -- state routes (CloudState delegation; Python cloud_state.py route table) -------

  def state_overview(conn, %{"name" => name}) do
    with_pid(conn, name, fn project_id, sd, dd ->
      versions = CloudState.list_versions(dd)
      src = CloudState.state_source(sd)

      summary =
        case src do
          nil -> %{"serial" => nil, "lineage" => nil, "resource_count" => 0, "tofu_version" => nil}
          path -> CloudState.summarize_state(File.read!(path))
        end

      json(conn,
        Map.merge(summary, %{
          "state_present" => src != nil,
          "state_source" => (src && Path.basename(src)) || nil,
          "lock" => CloudState.read_lock(dd, &RadasAI.Executions.get_execution/2, project_id),
          "versions" => Enum.take(versions, 20),
          "version_count" => length(versions),
          "backend" => CloudState.read_backend_config(sd)
        })
      )
    end)
  end

  def state_lock_get(conn, %{"name" => name}) do
    with_pid(conn, name, fn project_id, _sd, dd ->
      json(conn, %{"lock" => CloudState.read_lock(dd, &RadasAI.Executions.get_execution/2, project_id)})
    end)
  end

  def state_lock_acquire(conn, %{"name" => name}) do
    body = conn.body_params || %{}

    with_pid(conn, name, fn project_id, _sd, dd ->
      case CloudState.acquire_lock(dd,
             actor: (conn.assigns[:current_user] || %{})["user_id"],
             operation: String.slice(to_string(body["operation"] || "manual"), 0, 40),
             note: String.slice(to_string(body["note"] || ""), 0, 300),
             get_execution: &RadasAI.Executions.get_execution/2,
             project_id: project_id
           ) do
        %{"ok" => true, "lock" => lock} -> conn |> put_status(201) |> json(%{"ok" => true, "lock" => lock})

        %{"ok" => false, "lock" => existing} ->
          conn |> put_status(409) |> json(%{"error" => "Stack state is already locked.", "ok" => false, "lock" => existing})
      end
    end)
  end

  def state_lock_release(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, _sd, dd ->
      res =
        CloudState.release_lock(dd,
          lock_id: conn.query_params["lock_id"],
          actor: (conn.assigns[:current_user] || %{})["user_id"],
          force: conn.query_params["force"] in ["1", "true", "yes"],
          reason: conn.query_params["reason"] || ""
        )

      if res["ok"] do
        json(conn, res)
      else
        conn |> put_status(409) |> json(res)
      end
    end)
  end

  def state_versions_list(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, _sd, dd ->
      versions = CloudState.list_versions(dd)
      json(conn, %{"versions" => versions, "count" => length(versions), "max" => CloudState.max_versions()})
    end)
  end

  def state_versions_snapshot(conn, %{"name" => name}) do
    with_pid(conn, name, fn _project_id, sd, dd ->
      case CloudState.snapshot_state(sd, dd,
             actor: (conn.assigns[:current_user] || %{})["user_id"],
             reason: "manual"
           ) do
        nil ->
          conn
          |> put_status(409)
          |> json(%{
            "ok" => false,
            "error" =>
              "Nothing to snapshot — no state file on disk, or it is identical to the latest version."
          })

        entry ->
          conn |> put_status(201) |> json(%{"ok" => true, "version" => entry})
      end
    end)
  end

  # -- shared resolution (Python cloud_state._resolve) ----------------------------

  defp with_pid(conn, name, fun) do
    project_id = project_id(conn, conn.query_params)

    with_project_access(conn, project_id, fn ->
      if not CloudStacks.valid_name?(name) or not File.dir?(CloudStacks.stack_dir(project_id, name)) do
        conn |> put_status(404) |> json(%{"error" => "Not found"})
      else
        fun.(project_id, CloudStacks.stack_dir(project_id, name), CloudStacks.stack_data_dir(project_id, name))
      end
    end)
  end
end
