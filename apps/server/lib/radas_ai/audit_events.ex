defmodule RadasAI.AuditEvents do
  @moduledoc """
  Port of `services/audit_events.py` — global append-only audit log
  (`audit_log` Postgres table, shared with Flask). Best-effort: failures
  never interrupt the caller.
  """

  import RadasAI.DB

  alias Radas.Redaction

  @doc """
  Record one audit event (redacted meta, best-effort). Never raises.
  """
  @spec record_audit_event(String.t(), keyword()) :: :ok
  def record_audit_event(action, opts \\ []) do
    actor_user_id = Keyword.get(opts, :actor_user_id)
    target_type = Keyword.get(opts, :target_type)
    target_id = Keyword.get(opts, :target_id)
    meta = Keyword.get(opts, :meta)

    safe_meta =
      if meta in [nil, %{}] do
        nil
      else
        meta
        |> normalize_meta()
        |> Redaction.redact_sensitive()
        |> Jason.encode!()
      end

    execute!(
      """
      INSERT INTO audit_log (actor_user_id, action, target_type, target_id, meta_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      """,
      [actor_user_id, action, target_type, target_id, safe_meta, now_iso()]
    )

    :ok
  rescue
    _ -> :ok
  end

  defp normalize_meta(meta) when is_map(meta), do: Map.new(meta, fn {k, v} -> {to_string(k), v} end)
  defp normalize_meta(_), do: %{}

  defp now_iso, do: DateTime.utc_now() |> DateTime.to_iso8601()
end
