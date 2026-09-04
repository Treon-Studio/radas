defmodule RadasAI.EndpointKeys do
  @moduledoc """
  Port of `services/ai_router/endpoint_keys.py`.

  Gateway endpoint API keys (`radas_epk_*`) let OpenAI-compatible clients
  authenticate without a RADAS JWT. Raw keys are shown exactly once at
  creation; only the SHA-256 hash is persisted.
  """

  import RadasAI.DB

  @key_prefix "radas_epk_"

  def key_prefix, do: @key_prefix

  defp hash(raw_key), do: Base.encode16(:crypto.hash(:sha256, raw_key), case: :lower)

  @doc "Create one endpoint key; the raw key is returned only here."
  @spec create_key(String.t(), String.t()) :: map()
  def create_key(org_id, label \\ "") do
    raw_key = @key_prefix <> (:crypto.strong_rand_bytes(24) |> Base.url_encode64(padding: false))
    key_id = "epk-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))

    execute!(
      "INSERT INTO org_ai_endpoint_keys (id, org_id, key_hash, key_prefix, label, is_active, created_at) " <>
        "VALUES ($1, $2, $3, $4, $5, TRUE, $6)",
      [key_id, org_id, hash(raw_key), String.slice(raw_key, 0, 14), String.trim(label || ""), now()]
    )

    %{"id" => key_id, "key" => raw_key, "key_prefix" => String.slice(raw_key, 0, 14)}
  end

  @doc "Resolve one presented key; returns the org-scoped row or nil."
  @spec lookup(String.t()) :: map() | nil
  def lookup(raw_key) when is_binary(raw_key) do
    if String.starts_with?(raw_key, @key_prefix) do
      query_one!(
        "SELECT id, org_id, label, is_active FROM org_ai_endpoint_keys WHERE key_hash = $1",
        [hash(raw_key)]
      )
      |> case do
        %{"is_active" => true} = row -> row
        _ -> nil
      end
    end
  end

  def lookup(_), do: nil

  @doc "Record last-used; must never fail a gateway request."
  @spec touch(String.t()) :: :ok
  def touch(key_id) do
    execute!("UPDATE org_ai_endpoint_keys SET last_used_at = $1 WHERE id = $2", [now(), key_id])
    :ok
  rescue
    _ -> :ok
  end

  @doc "Key metadata only — never the hash and never the raw key."
  @spec list_keys(String.t()) :: [map()]
  def list_keys(org_id) do
    query_all!(
      "SELECT id, key_prefix, label, is_active, created_at, last_used_at " <>
        "FROM org_ai_endpoint_keys WHERE org_id = $1 ORDER BY created_at DESC",
      [org_id]
    )
  end

  @doc "Revoke one key for an org; returns whether a row was deleted."
  @spec revoke(String.t(), String.t()) :: boolean()
  def revoke(org_id, key_id) do
    execute!("DELETE FROM org_ai_endpoint_keys WHERE id = $1 AND org_id = $2", [key_id, org_id]) > 0
  end
end
