defmodule RadasAI.ApprovalService do
  @moduledoc """
  Port of `services/approval_service.py` (Fase 2 — UC 50/68/72 + UC 615/616/
  617/128). Approvals live in `DATA_DIR/approvals.json` (shared store shape
  with Flask). `decide/4` auto-queues an `apply` run after approval (UC 51)
  via `RadasAI.CloudStacks.create_execution/4`.
  """

  alias RadasAI.CloudStacks
  alias RadasAI.Flags
  alias RadasAI.ProjectPaths

  @actions ["apply", "destroy", "plan"]

  defp store_path, do: Path.join([ProjectPaths.data_dir(), "approvals.json"])

  defp load do
    case File.read(store_path()) do
      {:ok, binary} ->
        case Jason.decode(binary) do
          {:ok, recs} when is_list(recs) -> Enum.filter(recs, &is_map/1)
          _ -> []
        end

      _ ->
        []
    end
  end

  defp save(records) do
    path = store_path()
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, Jason.encode!(records, pretty: true))
    records
  end

  defp expired?(rec) do
    expires_at = rec["expires_at"]
    rec["status"] == "pending" and is_number(expires_at) and now() > expires_at
  end

  defp now, do: System.system_time(:second)

  @doc "Create a pending approval (TTL 24h default). Raises on empty stack."
  @spec create_approval(String.t(), String.t(), String.t(), keyword()) :: map()
  def create_approval(stack, project_id, action, opts \\ []) do
    requested_by = Keyword.get(opts, :requested_by, "")
    note = Keyword.get(opts, :note, "")
    ttl = Keyword.get(opts, :ttl_seconds, 86400)
    now = now()

    rec = %{
      "id" => Ecto.UUID.generate(),
      "stack" => stack,
      "project_id" => project_id,
      "action" => action,
      "status" => "pending",
      "requested_by" => requested_by,
      "note" => note,
      "created_at" => now,
      "expires_at" => now + max(60, trunc(ttl)),
      "decided_at" => nil,
      "decided_by" => nil,
      "retest_run_id" => nil
    }

    save(load() ++ [rec])
    rec
  end

  @doc """
  Decide one approval. Rejections require a reason. Expired pending records
  flip to `expired` instead (UC615). Approval of `apply` auto-queues the run
  (UC 51). Returns nil when the id is unknown.
  """
  @spec decide(String.t(), String.t(), keyword()) :: map() | nil
  def decide(approval_id, status, opts \\ []) do
    decided_by = Keyword.get(opts, :decided_by, "")
    reason = Keyword.get(opts, :reason, "")

    if status == "rejected" and String.trim(reason) == "" do
      raise ArgumentError, message: "rejection reason is mandatory"
    end

    records = load()

    {records, result} =
      Enum.map_reduce(records, nil, fn r, acc ->
        if r["id"] != approval_id do
          {r, acc}
        else
          if expired?(r) do
            r =
              r
              |> Map.put("status", "expired")
              |> Map.put("decided_at", now())
              |> Map.put("decided_by", "system")

            {r, r}
          else
            r =
              r
              |> Map.put("status", status)
              |> Map.put("decided_at", now())
              |> Map.put("decided_by", decided_by)
              |> then(fn r -> if reason != "", do: Map.put(r, "rejection_reason", String.trim(reason)), else: r end)

            if status == "approved" and r["action"] == "apply" do
              try do
                CloudStacks.create_execution(r["project_id"], r["stack"], "apply",
                  triggered_by: "approval:#{approval_id}"
                )
              rescue
                _ -> nil
              end
            end

            {r, r}
          end
        end
      end)

    if result do
      save(records)
    end

    result
  end

  @doc "One approval by id, or nil."
  @spec get_approval(String.t()) :: map() | nil
  def get_approval(approval_id), do: Enum.find(load(), &(&1["id"] == approval_id))

  @doc "Newest-first listing with optional project/status filters; lazily expires."
  @spec list_approvals(String.t() | nil, String.t() | nil) :: [map()]
  def list_approvals(project_id \\ nil, status \\ nil) do
    records = load()

    {records, changed} =
      Enum.map_reduce(records, false, fn r, changed ->
        if expired?(r) do
          {Map.merge(r, %{"status" => "expired", "decided_at" => now(), "decided_by" => "system"}), true}
        else
          {r, changed}
        end
      end)

    if changed, do: save(records)

    records
    |> Enum.filter(&(project_id in [nil, ""] or &1["project_id"] == project_id))
    |> Enum.filter(&(status in [nil, ""] or &1["status"] == status))
    |> Enum.sort_by(&(&1["created_at"] || 0), :desc)
  end

  @doc "Any approved record for (stack, action)?"
  @spec has_approved?(String.t(), String.t(), String.t()) :: boolean()
  def has_approved?(stack, project_id, action) do
    Enum.any?(list_approvals(project_id), &(&1["stack"] == stack and &1["action"] == action and &1["status"] == "approved"))
  end

  @doc "Most recent pending record for (stack, action), or nil."
  @spec latest_pending(String.t(), String.t(), String.t()) :: map() | nil
  def latest_pending(stack, project_id, action) do
    Enum.find(list_approvals(project_id), &(&1["stack"] == stack and &1["action"] == action and &1["status"] == "pending"))
  end

  @doc "Feature-flag skip gate (UC128): approval.skip.* / auto_approve keys."
  @spec should_skip_approval?(String.t(), String.t(), String.t(), keyword()) :: boolean()
  def should_skip_approval?(stack, project_id, action \\ "apply", opts \\ []) do
    env = Keyword.get(opts, :env, "prod") || "prod"
    org_id = Keyword.get(opts, :org_id)

    candidate_keys = [
      "approval.skip.#{action}",
      "approval.#{action}.skip",
      "approval.skip",
      "approval.auto_approve",
      "stack.#{stack}.skip_approval",
      "approval.stack.#{stack}.skip"
    ]

    Enum.any?(candidate_keys, fn key ->
      res = Flags.evaluate_scoped(key, env: env, project_id: project_id, org_id: org_id)
      res["enabled"] == true
    end)
  end

  def actions, do: @actions
end
