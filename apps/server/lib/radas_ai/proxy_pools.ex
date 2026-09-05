defmodule RadasAI.ProxyPools do
  @moduledoc """
  Port of `services/ai_router/proxy_pools.py`.

  Org egress proxy pools: http(s) proxy URLs encrypted at rest, sticky
  round-robin across active pools, and proxy-bound gateway instances so every
  upstream call for an org egresses through the pool.
  """

  import RadasAI.DB

  alias RadasAI.SecretEncryption

  defmodule ProxyPoolError do
    @moduledoc false
    defexception [:message, :status]
    def exception(opts) do
      %__MODULE__{message: Keyword.get(opts, :message, "proxy pool error"), status: Keyword.get(opts, :status, 400)}
    end
  end

  @gateway_cache :radas_ai_proxy_gateway_cache

  @doc "Redacted pool metadata — the proxy URL is never returned."
  @spec list_pools(String.t()) :: [map()]
  def list_pools(org_id) do
    query_all!(
      "SELECT id, label, is_active, created_at, updated_at FROM org_ai_proxy_pools WHERE org_id = $1 ORDER BY created_at ASC",
      [org_id]
    )
  end

  @doc "Validate and upsert one pool (URL encrypted at rest)."
  @spec upsert_pool(String.t(), String.t(), String.t()) :: map()
  def upsert_pool(org_id, label, proxy_url) do
    label = String.trim(label || "") |> String.slice(0, 119)
    if label == "", do: raise(ProxyPoolError, message: "label is required")
    url = validate_proxy_url(proxy_url)

    encrypted = SecretEncryption.encrypt(url)
    existing = query_one!("SELECT id FROM org_ai_proxy_pools WHERE org_id = $1 AND label = $2", [org_id, label])

    case existing do
      %{"id" => id} ->
        execute!("UPDATE org_ai_proxy_pools SET proxy_url_encrypted = $1, is_active = TRUE, updated_at = $2 WHERE id = $3", [encrypted, now(), id])
        %{"id" => id, "label" => label}

      nil ->
        pool_id = "pool-" <> String.pad_leading(Integer.to_string(System.unique_integer([:positive]) |> rem(10_000_000_000)), 10, "0")

        execute!(
          "INSERT INTO org_ai_proxy_pools (id, org_id, label, proxy_url_encrypted, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, TRUE, $5, $5)",
          [pool_id, org_id, label, encrypted, now()]
        )

        %{"id" => pool_id, "label" => label}
    end
  end

  @doc "Delete one pool for an org; returns whether a row was deleted."
  @spec delete_pool(String.t(), String.t()) :: boolean()
  def delete_pool(org_id, pool_id) do
    execute!("DELETE FROM org_ai_proxy_pools WHERE id = $1 AND org_id = $2", [pool_id, org_id]) > 0
  end

  @doc "Sticky round-robin across the org's active pools; nil when empty."
  @spec resolve_proxy_url(String.t()) :: String.t() | nil
  def resolve_proxy_url(org_id) do
    rows =
      query_all!(
        "SELECT id, proxy_url_encrypted FROM org_ai_proxy_pools WHERE org_id = $1 AND is_active = TRUE ORDER BY created_at ASC",
        [org_id]
      )

    case rows do
      [] ->
        nil

      rows ->
        rotated =
          if length(rows) > 1 do
            offset = rotate_offset(org_id, length(rows))
            Enum.drop(rows, offset) ++ Enum.take(rows, offset)
          else
            rows
          end

        case SecretEncryption.decrypt_safe(hd(rotated)["proxy_url_encrypted"]) do
          {:ok, url} -> if url == "", do: nil, else: url
          _ -> nil
        end
    end
  end

  @doc """
  Build a Req request fn bound to one proxy URL — every upstream call made
  through it egresses via that proxy. (Gateway-level, cached per URL.)
  """
  @spec proxy_options(String.t()) :: keyword()
  def proxy_options(proxy_url) do
    [proxy: proxy_url]
  end

  @doc "Rotation offset cache read (exposed for tests)."
  def rotate_offset(org_id, modulo) do
    :global.set_lock({__MODULE__, org_id})
    offsets = :persistent_term.get(:radas_ai_proxy_rotation, %{})
    offset = Map.get(offsets, org_id, 0)
    :persistent_term.put(:radas_ai_proxy_rotation, Map.put(offsets, org_id, rem(offset + 1, modulo)))
    :global.del_lock({__MODULE__, org_id})
    offset
  end

  @doc "Validate an http(s) proxy URL; returns the normalized URL."
  @spec validate_proxy_url(String.t()) :: String.t()
  def validate_proxy_url(proxy_url) do
    url = String.trim(proxy_url || "")
    if url == "", do: raise(ProxyPoolError, message: "proxy_url is required")

    case URI.parse(url) do
      %URI{scheme: scheme, host: host} when scheme in ["http", "https"] and host not in [nil, ""] ->
        String.trim_trailing(url, "/")

      _ ->
        raise ProxyPoolError, message: "proxy_url must be an http(s) proxy URL"
    end
  end

  defp cache_table do
    case :ets.info(@gateway_cache) do
      :undefined -> :ets.new(@gateway_cache, [:named_table, :set, :public])
      _ -> @gateway_cache
    end
  end
end
