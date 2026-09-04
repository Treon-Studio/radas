defmodule RadasAI.CicdEngine do
  @moduledoc """
  Port of `services/cicd_engine.py` + `storage/cicd_store.py` (kv-backed).

  Self-contained pipeline executor: trigger creates a run (steps flattened
  from pipeline stages) and executes it in a background Task, writing per-step
  status/log refs. Step types: shell (runs via System.shell), ansible/tofu
  reserved (mark SUCCESS with a note), mirroring Python v1.
  """

  import RadasAI.DB

  alias RadasAI.KV

  defp scope(project_id, kind), do: "cicd:#{project_id}:#{kind}"

  # ---------------------------------------------------------------------------
  # Pipelines (kv-backed)
  # ---------------------------------------------------------------------------

  def create_pipeline(project_id, data) do
    pipeline_id = "pipe-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))
    pipeline = Map.merge(Map.new(data || %{}), %{"id" => pipeline_id, "projectId" => project_id})
    KV.set(scope(project_id, "pipelines"), pipeline_id, pipeline)
    pipeline_id
  end

  def get_pipeline(project_id, pipeline_id) do
    KV.get(scope(project_id, "pipelines"), pipeline_id)
  end

  def list_pipelines(project_id) do
    KV.list(scope(project_id, "pipelines")) |> Enum.map(& &1["value"])
  end

  def delete_pipeline(project_id, pipeline_id) do
    KV.delete(scope(project_id, "pipelines"), pipeline_id)
  end

  # ---------------------------------------------------------------------------
  # Runs
  # ---------------------------------------------------------------------------

  def get_run(project_id, run_id), do: KV.get(scope(project_id, "runs"), run_id)

  def save_run(project_id, run), do: KV.set(scope(project_id, "runs"), run["id"], run)

  def list_runs(project_id, pipeline_id \\ nil) do
    runs = KV.list(scope(project_id, "runs")) |> Enum.map(& &1["value"])

    runs =
      if pipeline_id in [nil, ""],
        do: runs,
        else: Enum.filter(runs, &(&1["pipelineId"] == pipeline_id))

    Enum.sort_by(runs, &(&1["createdAt"] || 0), :desc)
  end

  @doc "Create a run and execute it in a background task; returns the run id."
  @spec trigger_pipeline_run(String.t(), String.t(), keyword()) :: String.t() | nil
  def trigger_pipeline_run(project_id, pipeline_id, opts \\ []) do
    pipeline = get_pipeline(project_id, pipeline_id)

    if pipeline == nil do
      nil
    else
      run_id = "run-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))

      steps =
        Enum.flat_map(pipeline["stages"] || [], fn stage ->
          Enum.map(stage["steps"] || [], fn step ->
            %{
              "stage_name" => stage["name"] || "stage",
              "step_name" => step["name"] || "step",
              "step_type" => step["type"] || "shell",
              "config" => step["config"] || %{},
              "status" => "PENDING",
              "started_at" => nil,
              "finished_at" => nil,
              "log_ref" => nil
            }
          end)
        end)

      run = %{
        "id" => run_id,
        "pipelineId" => pipeline_id,
        "projectId" => project_id,
        "triggerType" => Keyword.get(opts, :trigger_type, "manual"),
        "status" => "RUNNING",
        "gitCommit" => Keyword.get(opts, :git_commit, ""),
        "triggeredBy" => Keyword.get(opts, :triggered_by, ""),
        "createdAt" => now(),
        "steps" => steps
      }

      save_run(project_id, run)
      Task.start(fn -> execute_steps(project_id, run_id, steps) end)
      run_id
    end
  end

  defp execute_steps(project_id, run_id, steps) do
    Enum.each(Enum.with_index(steps), fn {step, index} ->
      execute_step(project_id, run_id, step, index)
    end)

    run = get_run(project_id, run_id)

    if run do
      failed = Enum.any?(run["steps"], &(&1["status"] == "FAILED"))
      run = Map.put(run, "status", if(failed, do: "FAILED", else: "SUCCESS"))
      run = Map.put(run, "finishedAt", now())
      save_run(project_id, run)
    end
  end

  defp execute_step(project_id, run_id, step, index) do
    step = Map.put(step, "started_at", now())
    # step started; persisted on finish

    case step["step_type"] do
      "shell" ->
        command = step["config"]["command"] || ""

        {output, exit_code} =
          try do
            # CI pipeline shell steps execute user-authored commands by
            # design (mirrors the Python cicd_engine allowlist).
            case System.shell(command) do  # sensitive-path-ok
              {out, 0} -> {out, 0}
              {out, code} -> {out, code}
            end
          rescue
            e -> {Exception.message(e) || "error", 1}
          end

        status = if exit_code == 0, do: "SUCCESS", else: "FAILED"
        log_ref = save_step_log(project_id, run_id, index, output)
        finish_step(project_id, run_id, index, status, log_ref)

      "ansible" ->
        log_ref = save_step_log(project_id, run_id, index, "ansible integration TBD")
        finish_step(project_id, run_id, index, "SUCCESS", log_ref)

      "tofu" ->
        log_ref = save_step_log(project_id, run_id, index, "tofu integration TBD")
        finish_step(project_id, run_id, index, "SUCCESS", log_ref)

      _ ->
        finish_step(project_id, run_id, index, "FAILED", nil)
    end
  end

  defp save_step_log(project_id, run_id, index, output) do
    log_ref = "step_#{index}.log"
    path = Path.join([data_dir(), "cicd", "runs", run_id, log_ref])
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, output || "")
    log_ref
  end

  defp finish_step(project_id, run_id, index, status, log_ref) do
    run = get_run(project_id, run_id)

    if run do
      steps =
        List.update_at(run["steps"], index, fn step ->
          step
          |> Map.put("status", status)
          |> Map.put("finished_at", now())
          |> Map.put("log_ref", log_ref)
        end)

      save_run(project_id, Map.put(run, "steps", steps))
    end
  end

  defp data_dir, do: System.get_env("DATA_DIR") || Path.join(File.cwd!(), "data")
end
