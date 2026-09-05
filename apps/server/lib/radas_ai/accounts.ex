defmodule RadasAI.Accounts do
  @moduledoc """
  Port of `services/ai_router/accounts.py`.

  Multi-account provider credentials. One provider can hold several API-key
  accounts; equal-priority accounts are served sticky round-robin. Resolution
  order per request: active provider accounts (rotated) → the provider vault
  default key → OAuth accounts → the provider environment variable.
  """

  import RadasAI.DB

  alias RadasAI.SecretEncryption

  @doc "Active accounts for one provider, ordered by priority then age."
  @spec list_accounts(String.t(), String.t()) :: [map()]
  def list_accounts(org_id, provider_name) do
    query_all!(
      "SELECT id, label, api_key_encrypted, base_url, priority FROM org_ai_provider_accounts " <>
        "WHERE org_id = $1 AND provider_name = $2 AND is_active = TRUE " <>
        "ORDER BY priority ASC, created_at ASC",
      [org_id, provider_name]
    )
  end

  @doc """
  Sticky round-robin among the top-priority accounts only; lower-priority
  accounts keep their order as later fallback candidates.
  """
  @spec rotate([map()], String.t(), String.t()) :: [map()]
  def rotate(rows, org_id, provider_name)

  def rotate([], _org_id, _provider_name), do: []
  def rotate([row], _org_id, _provider_name), do: [row]

  def rotate(rows, org_id, provider_name) do
    top_priority = rows |> hd() |> Map.fetch!("priority")
    leaders = Enum.filter(rows, &(Map.fetch!(&1, "priority") == top_priority))
    rest = Enum.filter(rows, &(Map.fetch!(&1, "priority") != top_priority))

    leaders =
      if length(leaders) > 1 do
        offset = next_offset(org_id, provider_name, length(leaders))
        Enum.drop(leaders, offset) ++ Enum.take(leaders, offset)
      else
        leaders
      end

    leaders ++ rest
  end

  defp next_offset(org_id, provider_name, modulo) do
    key = {org_id, provider_name}
    :global.set_lock({__MODULE__, key})
    offsets = :persistent_term.get(:radas_ai_accounts_rotation, %{})
    offset = Map.get(offsets, key, 0)
    :persistent_term.put(:radas_ai_accounts_rotation, Map.put(offsets, key, rem(offset + 1, modulo)))
    :global.del_lock({__MODULE__, key})
    offset
  end

  @doc "Ordered candidate credentials for one upstream provider call."
  @spec gather_credentials(String.t(), String.t(), String.t()) :: [map()]
  def gather_credentials(org_id, provider_name, env_var \\ "") do
    credentials =
      list_accounts(org_id, provider_name)
      |> rotate(org_id, provider_name)
      |> Enum.flat_map(fn row ->
        key = decrypt_value(row["api_key_encrypted"])

        if key in [nil, ""], do: [], else: [%{"api_key" => key, "base_url" => row["base_url"] || ""}]
      end)

    credentials =
      if credentials == [] do
        provider =
          query_one!(
            "SELECT api_key_encrypted, base_url FROM org_ai_providers " <>
              "WHERE org_id = $1 AND provider_name = $2 AND is_active = TRUE",
            [org_id, provider_name]
          )

        case provider do
          %{"api_key_encrypted" => encrypted} ->
            key = decrypt_value(encrypted)

            if key in [nil, ""],
              do: [],
              else: [%{"api_key" => key, "base_url" => provider["base_url"] || ""}]

          nil ->
            []
        end
      else
        credentials
      end

    credentials =
      if credentials == [] do
        # OAuth accounts rank ahead of environment fallbacks: they represent
        # explicitly connected org credentials, not ambient host config.
        case RadasAI.OAuth.oauth_provider_name(provider_name) do
          nil -> []
          oauth_name ->
            case RadasAI.OAuth.get_valid_access_token(org_id, oauth_name) do
              nil -> []
              token -> [%{"api_key" => token, "base_url" => ""}]
            end
        end
      else
        credentials
      end

    if credentials == [] and env_var not in [nil, ""] do
      case System.get_env(env_var) do
        nil -> []
        "" -> []
        key -> [%{"api_key" => key, "base_url" => ""}]
      end
    else
      credentials
    end
  end

  # Legacy rows created before encrypted storage was introduced are plain text.
  defp decrypt_value(value) do
    SecretEncryption.decrypt(value)
  rescue
    _ -> value
  end
end
