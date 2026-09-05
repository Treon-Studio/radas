defmodule RadasAI.OAuth do
  @moduledoc """
  Port of `services/ai_router/oauth.py`.

  OAuth provider adapter framework covering all 24 upstream providers through
  three flow families:

  - Authorization-code + PKCE (S256) — claude, codex, gemini-cli, antigravity,
    clinepass, iflow, github;
  - RFC 8628 device-code — kimi, grok-cli, github-device;
  - Encrypted operator token import — cursor, kimchi, kiro, trae,
    codebuddy-cn/intl, cline.

  Flow state lives in the RADAS kv store with a short TTL and is single-use;
  tokens are encrypted with `RadasAI.SecretEncryption` before they touch
  PostgreSQL and are never returned by any API.
  """

  import RadasAI.DB

  alias RadasAI.SecretEncryption

  defmodule OAuthError do
    @moduledoc "Management-plane OAuth failure; never carries token material."
    defexception [:message, :status]

    def exception(opts) do
      %__MODULE__{message: Keyword.get(opts, :message, "oauth error"), status: Keyword.get(opts, :status, 400)}
    end
  end

  @flow_ttl_seconds 600

  # ---------------------------------------------------------------------------
  # Provider registries
  # ---------------------------------------------------------------------------

  @oauth_providers %{
    "claude" => %{
      "authorize_url" => "https://claude.ai/oauth/authorize",
      "token_url" => "https://api.anthropic.com/v1/oauth/token",
      "scopes" => "org:create_api_key user:profile user:inference",
      "client_id_env" => "RADAS_OAUTH_CLAUDE_CLIENT_ID",
      "refresh_encoding" => "json",
      "refresh_lead_seconds" => 14_400
    },
    "codex" => %{
      "authorize_url" => "https://auth.openai.com/oauth/authorize",
      "token_url" => "https://auth.openai.com/oauth/token",
      "scopes" => "openid profile email offline_access",
      "client_id_env" => "RADAS_OAUTH_CODEX_CLIENT_ID",
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60,
      "default_client_id" => "app_EMoamEEZ73f0CkXaXp7hrann"
    },
    "gemini-cli" => %{
      "authorize_url" => "https://accounts.google.com/o/oauth2/v2/auth",
      "token_url" => "https://oauth2.googleapis.com/token",
      "scopes" =>
        "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      "client_id_env" => "RADAS_OAUTH_GEMINI_CLI_CLIENT_ID",
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60
    },
    "antigravity" => %{
      "authorize_url" => "https://accounts.google.com/o/oauth2/v2/auth",
      "token_url" => "https://oauth2.googleapis.com/token",
      "scopes" =>
        "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs",
      "client_id_env" => "RADAS_OAUTH_ANTIGRAVITY_CLIENT_ID",
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60
    },
    "clinepass" => %{
      "authorize_url" => "https://api.cline.bot/api/v1/auth/authorize",
      "token_url" => "https://api.cline.bot/api/v1/auth/token",
      "scopes" => "",
      "client_id_env" => "RADAS_OAUTH_CLINEPASS_CLIENT_ID",
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60
    },
    "iflow" => %{
      "authorize_url" => "https://iflow.cn/oauth",
      "token_url" => "https://iflow.cn/oauth/token",
      "scopes" => "",
      "client_id_env" => "RADAS_OAUTH_IFLOW_CLIENT_ID",
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60,
      "default_client_id" => "10009311001"
    },
    "github" => %{
      "authorize_url" => "https://github.com/login/oauth/authorize",
      "token_url" => "https://github.com/login/oauth/access_token",
      "scopes" => "read:user",
      "client_id_env" => "RADAS_OAUTH_GITHUB_CLIENT_ID",
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60,
      "default_client_id" => "Iv1.b507a08c87ecfe98"
    }
  }

  @device_providers %{
    "kimi" => %{
      "device_code_url" => "https://auth.kimi.com/api/oauth/device_authorization",
      "token_url" => "https://auth.kimi.com/api/oauth/token",
      "client_id_env" => "RADAS_OAUTH_KIMI_CLIENT_ID",
      "default_client_id" => "17e5f671-d194-4dfb-9706-5516cb48c098",
      "scope" => ""
    },
    "grok-cli" => %{
      "device_code_url" => "https://auth.x.ai/oauth2/device/code",
      "token_url" => "https://auth.x.ai/oauth2/token",
      "client_id_env" => "RADAS_OAUTH_GROK_CLI_CLIENT_ID",
      "default_client_id" => "b1a00492-073a-47ea-816f-4c329264a828",
      "scope" => "openid profile email offline_access"
    },
    "github-device" => %{
      "device_code_url" => "https://github.com/login/device/code",
      "token_url" => "https://github.com/login/oauth/access_token",
      "client_id_env" => "RADAS_OAUTH_GITHUB_CLIENT_ID",
      "default_client_id" => "Iv1.b507a08c87ecfe98",
      "scope" => "read:user"
    }
  }

  @import_providers %{
    "cursor" => "import_token",
    "kimchi" => "browser_token",
    "kiro" => "aws_oidc_device",
    "trae" => "marscode_exchange",
    "codebuddy-cn" => "state_poll",
    "codebuddy-intl" => "state_poll",
    "cline" => "cli_session"
  }

  @gateway_to_oauth %{"anthropic" => "claude", "openai" => "codex", "github" => "github", "google" => "gemini-cli"}

  def oauth_providers, do: @oauth_providers
  def device_providers, do: @device_providers
  def import_providers, do: @import_providers
  def gateway_to_oauth, do: @gateway_to_oauth

  def all_oauth_provider_names do
    MapSet.union(MapSet.new(Map.keys(@oauth_providers)), MapSet.new(Map.keys(@device_providers)))
    |> MapSet.union(MapSet.new(Map.keys(@import_providers)))
    |> MapSet.to_list()
    |> Enum.sort()
  end

  @doc "OAuth provider name backing a gateway provider, if any."
  def oauth_provider_name(gateway_provider) do
    name = Map.get(@gateway_to_oauth, gateway_provider, gateway_provider)

    if name in all_oauth_provider_names(), do: name
  end

  def client_id_for(spec), do: client_id(spec)

  defp client_id(spec) do
    env_value = System.get_env(spec["client_id_env"], "") |> String.trim()
    if env_value == "", do: spec["default_client_id"] || "", else: env_value
  end

  defp device_client_id(entry) do
    env_value = System.get_env(entry["client_id_env"], "") |> String.trim()
    if env_value == "", do: entry["default_client_id"] || "", else: env_value
  end

  # ---------------------------------------------------------------------------
  # KV store (flow state)
  # ---------------------------------------------------------------------------

  defp kv_get(scope, key) do
    case query_one!("SELECT value FROM kv_store WHERE scope = $1 AND key = $2", [scope, key]) do
      nil -> nil
      row -> row["value"]
    end
  end

  defp kv_set(scope, key, value) do
    execute!(
      """
      INSERT INTO kv_store (scope, key, value, updated_at) VALUES ($1, $2, $3, $4)
      ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      """,
      [scope, key, value, now()]
    )
  end

  defp kv_delete(scope, key) do
    execute!("DELETE FROM kv_store WHERE scope = $1 AND key = $2", [scope, key])
  end

  # ---------------------------------------------------------------------------
  # Authorization-code + PKCE flow
  # ---------------------------------------------------------------------------

  @doc "Start one PKCE flow; returns authorize_url + state (single-use, TTL 600s)."
  @spec begin_flow(String.t(), String.t(), String.t(), String.t()) :: map()
  def begin_flow(org_id, provider, label, redirect_uri) do
    spec = Map.fetch!(@oauth_providers, provider)
    client_id = client_id(spec)

    if client_id in [nil, ""] do
      raise OAuthError, message: "OAuth client for #{provider} is not configured (#{spec["client_id_env"]})", status: 503
    end

    unless String.starts_with?(redirect_uri, ["http://127.0.0.1:", "http://localhost:", "https://"]) do
      raise OAuthError, message: "redirect_uri must be https or a loopback http URL"
    end

    state = :crypto.strong_rand_bytes(24) |> Base.url_encode64(padding: false)
    {verifier, challenge} = pkce_pair()

    kv_set("ai_oauth_flow", state, %{
      "org_id" => org_id,
      "provider" => provider,
      "label" => String.slice(String.trim(label || ""), 0, 119),
      "redirect_uri" => redirect_uri,
      "code_verifier" => verifier,
      "created_at" => now()
    })

    params =
      URI.encode_query(%{
        "response_type" => "code",
        "client_id" => client_id,
        "redirect_uri" => redirect_uri,
        "scope" => spec["scopes"],
        "code_challenge" => challenge,
        "code_challenge_method" => "S256",
        "state" => state
      })

    %{"authorize_url" => "#{spec["authorize_url"]}?#{params}", "state" => state}
  end

  @doc "Complete one PKCE flow: consume the state, exchange the code, store tokens."
  @spec complete_flow(String.t(), String.t(), String.t(), String.t()) :: map()
  def complete_flow(org_id, provider, code, state) do
    spec = Map.fetch!(@oauth_providers, provider)
    client_id = client_id(spec)

    if client_id in [nil, ""] do
      raise OAuthError, message: "OAuth client for #{provider} is not configured (#{spec["client_id_env"]})", status: 503
    end

    flow = load_flow(org_id, state, consume: true)

    tokens =
      token_request(spec, %{
        "grant_type" => "authorization_code",
        "client_id" => client_id,
        "code" => code,
        "redirect_uri" => flow["redirect_uri"],
        "code_verifier" => flow["code_verifier"]
      })

    store_tokens(org_id, provider, flow["label"], client_id, spec, tokens)
  end

  defp load_flow(org_id, state, opts) do
    flow = kv_get("ai_oauth_flow", state)

    unless is_map(flow) and flow["code_verifier"] not in [nil, ""] do
      raise OAuthError, message: "Unknown or expired OAuth state", status: 400
    end

    if flow["org_id"] != org_id do
      raise OAuthError, message: "OAuth state belongs to a different organization", status: 403
    end

    if now() - (flow["created_at"] || 0) > @flow_ttl_seconds do
      raise OAuthError, message: "OAuth flow expired; restart the connection", status: 400
    end

    if opts[:consume] do
      try do
        kv_delete("ai_oauth_flow", state)
      rescue
        _ -> :ok
      end
    end

    flow
  end

  defp token_request(spec, payload) do
    body =
      if spec["refresh_encoding"] == "json" and Map.get(payload, "grant_type") == "refresh_token" do
        Jason.encode!(payload)
      else
        URI.encode_query(Map.new(payload, fn {k, v} -> {k, to_string(v)} end))
      end

    case Req.post(spec["token_url"],
           body: body,
           headers: [
             {"Accept", "application/json"},
             {"Content-Type", "application/x-www-form-urlencoded"}
           ],
           receive_timeout: 30_000,
           retry: false
         ) do
      {:ok, %Req.Response{status: status, body: resp}} when status in 200..299 ->
        if is_map(resp) and resp["access_token"] not in [nil, ""] do
          resp
        else
          raise OAuthError, message: "Token endpoint rejected the exchange", status: 502
        end

      {:ok, %Req.Response{status: status}} ->
        raise OAuthError, message: "Token endpoint returned HTTP #{status}", status: 502

      {:error, _} ->
        raise OAuthError, message: "Token endpoint unreachable", status: 502
    end
  end

  # ---------------------------------------------------------------------------
  # Token persistence & refresh
  # ---------------------------------------------------------------------------

  defp store_tokens(org_id, provider, label, client_id, spec, tokens) do
    label =
      case String.trim(label || "") |> String.slice(0, 119) do
        "" -> "default"
        l -> l
      end

    access_token = to_string(tokens["access_token"] || "")
    refresh_token = to_string(tokens["refresh_token"] || "")
    expires_in = parse_int(tokens["expires_in"], 3600)
    scope = to_string(tokens["scope"] || spec["scopes"] || "")
    ts = now()

    if label == "", do: raise(OAuthError, message: "label is required")

    existing =
      query_one!(
        "SELECT id FROM org_ai_oauth_accounts WHERE org_id = $1 AND provider_name = $2 AND label = $3",
        [org_id, provider, label]
      )

    encrypted_access = SecretEncryption.encrypt(access_token)
    encrypted_refresh = if refresh_token == "", do: nil, else: SecretEncryption.encrypt(refresh_token)

    account_id =
      case existing do
        %{"id" => id} ->
          execute!(
            "UPDATE org_ai_oauth_accounts SET access_token_encrypted = $1, refresh_token_encrypted = $2, scope = $3, " <>
              "status = 'connected', expires_at = $4, updated_at = $5 WHERE id = $6",
            [encrypted_access, encrypted_refresh, scope, ts + expires_in, ts, id]
          )

          id

        nil ->
          account_id = "oa-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))

          execute!(
            "INSERT INTO org_ai_oauth_accounts (id, org_id, provider_name, label, client_id, access_token_encrypted, refresh_token_encrypted, scope, status, expires_at, created_at, updated_at) " <>
              "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'connected', $9, $10, $10)",
            [account_id, org_id, provider, label, client_id, encrypted_access, encrypted_refresh, scope, ts + expires_in, ts]
          )

          account_id
      end

    %{"id" => account_id, "label" => label, "provider" => provider, "status" => "connected", "expires_at" => ts + expires_in}
  end

  @doc "Refresh one stored account; returns the decrypted access token."
  @spec refresh_account(String.t(), String.t(), String.t(), keyword()) :: String.t()
  def refresh_account(org_id, provider, label, opts \\ []) do
    force = Keyword.get(opts, :force, false)
    spec = Map.fetch!(@oauth_providers, provider)

    row =
      query_one!(
        "SELECT * FROM org_ai_oauth_accounts WHERE org_id = $1 AND provider_name = $2 AND label = $3",
        [org_id, provider, label]
      )

    unless row and row["refresh_token_encrypted"] not in [nil, ""] do
      raise OAuthError, message: "No refreshable OAuth account for this provider", status: 404
    end

    expires_at = row["expires_at"] || 0.0

    if not force and now() < expires_at - spec["refresh_lead_seconds"] do
      SecretEncryption.decrypt(row["access_token_encrypted"])
    else
      refresh_token = SecretEncryption.decrypt(row["refresh_token_encrypted"])

      tokens =
        token_request(spec, %{
          "grant_type" => "refresh_token",
          "client_id" => client_id(spec),
          "refresh_token" => refresh_token
        })

      _ = store_tokens(org_id, provider, label, row["client_id"] || "", spec, tokens)
      to_string(tokens["access_token"])
    end
  end

  @doc "Newest connected account's access token, refreshing when due."
  @spec get_valid_access_token(String.t(), String.t()) :: String.t() | nil
  def get_valid_access_token(org_id, provider) do
    row =
      query_one!(
        "SELECT label, expires_at, access_token_encrypted, refresh_token_encrypted FROM org_ai_oauth_accounts " <>
          "WHERE org_id = $1 AND provider_name = $2 AND status = 'connected' ORDER BY updated_at DESC LIMIT 1",
        [org_id, provider]
      )

    case row do
      nil ->
        nil

      row ->
        spec = Map.get(@oauth_providers, provider)
        expires_at = row["expires_at"] || 0.0
        refreshable = spec != nil and row["refresh_token_encrypted"] not in [nil, ""]
        due = refreshable and now() >= expires_at - spec["refresh_lead_seconds"]

        if due do
          try do
            refresh_account(org_id, provider, row["label"])
          rescue
            OAuthError ->
              execute!(
                "UPDATE org_ai_oauth_accounts SET status = 'error', updated_at = $1 WHERE org_id = $2 AND provider_name = $3 AND label = $4",
                [now(), org_id, provider, row["label"]]
              )

              nil
          end
        else
          SecretEncryption.decrypt(row["access_token_encrypted"])
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Device flow (RFC 8628)
  # ---------------------------------------------------------------------------

  @doc "RFC 8628 device-authorization start; device_code stays server-side."
  @spec begin_device_flow(String.t(), String.t(), String.t()) :: map()
  def begin_device_flow(org_id, provider, label) do
    entry = Map.get(@device_providers, provider) || raise OAuthError, message: "Provider #{provider} does not support the device flow", status: 404
    client_id = device_client_id(entry)

    if client_id in [nil, ""] do
      raise OAuthError, message: "OAuth client for #{provider} is not configured (#{entry["client_id_env"]})", status: 503
    end

    payload =
      %{"client_id" => client_id}
      |> then(&if(entry["scope"] != "", do: Map.put(&1, "scope", entry["scope"]), else: &1))

    data = device_request(entry["device_code_url"], payload)
    device_code = to_string(data["device_code"] || "")
    user_code = to_string(data["user_code"] || "")
    verification_uri = to_string(data["verification_uri"] || "")

    if device_code == "" or user_code == "" or verification_uri == "" do
      raise OAuthError, message: "Device authorization endpoint returned an invalid payload", status: 502
    end

    state = :crypto.strong_rand_bytes(24) |> Base.url_encode64(padding: false)

    kv_set("ai_oauth_flow", state, %{
      "org_id" => org_id,
      "provider" => provider,
      "label" => trimmed_or(label, "default") |> String.slice(0, 119),
      "device_code" => device_code,
      "flow" => "device",
      "created_at" => now()
    })

    result = %{
      "state" => state,
      "user_code" => user_code,
      "verification_uri" => verification_uri,
      "interval" => parse_int(data["interval"], 5),
      "expires_in" => parse_int(data["expires_in"], 600)
    }

    if data["verification_uri_complete"],
      do: Map.put(result, "verification_uri_complete", to_string(data["verification_uri_complete"])),
      else: result
  end

  @doc "Poll the token endpoint once; returns {status: pending} or the account."
  @spec complete_device_flow(String.t(), String.t(), String.t()) :: map()
  def complete_device_flow(org_id, provider, state) do
    entry = Map.get(@device_providers, provider) || raise OAuthError, message: "Provider #{provider} does not support the device flow", status: 404
    client_id = device_client_id(entry)

    flow = kv_get("ai_oauth_flow", state)

    unless is_map(flow) and flow["flow"] == "device" and flow["org_id"] == org_id and flow["provider"] == provider do
      raise OAuthError, message: "Unknown or expired OAuth state", status: 400
    end

    if now() - (flow["created_at"] || 0) > @flow_ttl_seconds do
      raise OAuthError, message: "OAuth flow expired; restart the connection", status: 400
    end

    body =
      URI.encode_query(%{
        "grant_type" => "urn:ietf:params:oauth:grant-type:device_code",
        "client_id" => client_id,
        "device_code" => flow["device_code"]
      })

    case Req.post(entry["token_url"],
           body: body,
           headers: [
             {"Accept", "application/json"},
             {"Content-Type", "application/x-www-form-urlencoded"}
           ],
           receive_timeout: 30_000,
           retry: false
         ) do
      {:ok, %Req.Response{status: status, body: tokens}} when status in 200..299 ->
        unless is_map(tokens) and tokens["access_token"] not in [nil, ""] do
          raise OAuthError, message: "Token endpoint rejected the device exchange", status: 502
        end

        try do
          kv_delete("ai_oauth_flow", state)
        rescue
          _ -> :ok
        end

        account = store_tokens(org_id, provider, flow["label"], client_id, shim_spec(entry), tokens)
        Map.merge(%{"status" => "connected"}, account)

      {:ok, %Req.Response{status: 400, body: %{"error" => "authorization_pending"}}} ->
        %{"status" => "pending"}

      {:ok, %Req.Response{status: _status}} ->
        raise OAuthError, message: "Token endpoint rejected the device exchange", status: 502

      {:error, _} ->
        raise OAuthError, message: "Token endpoint unreachable", status: 502
    end
  end

  defp device_request(url, payload) do
    case Req.post(url,
           body: URI.encode_query(payload),
           headers: [
             {"Accept", "application/json"},
             {"Content-Type", "application/x-www-form-urlencoded"}
           ],
           receive_timeout: 30_000,
           retry: false
         ) do
      {:ok, %Req.Response{status: status, body: data}} when status in 200..299 and is_map(data) ->
        data

      {:ok, %Req.Response{status: status}} ->
        raise OAuthError, message: "Device authorization endpoint returned HTTP #{status}", status: 502

      {:error, _} ->
        raise OAuthError, message: "Device authorization endpoint unreachable", status: 502
    end
  end

  # ---------------------------------------------------------------------------
  # Encrypted token import
  # ---------------------------------------------------------------------------

  @doc "Encrypt and store an operator-supplied token (import_token/browser_token flows)."
  @spec import_token(String.t(), String.t(), keyword()) :: map()
  def import_token(org_id, provider, opts) do
    unless provider in all_oauth_provider_names() do
      raise OAuthError, message: "Unknown OAuth provider #{provider}", status: 404
    end

    label = Keyword.fetch!(opts, :label)
    access_token = Keyword.fetch!(opts, :access_token)

    if access_token == "" or String.length(access_token) > 8192 do
      raise OAuthError, message: "access_token is required"
    end

    refresh_token = Keyword.get(opts, :refresh_token, "")
    expires_in = Keyword.get(opts, :expires_in, 3600)
    scope = Keyword.get(opts, :scope, "")

    tokens = %{"access_token" => access_token, "expires_in" => expires_in, "scope" => scope}

    tokens =
      if refresh_token == "", do: tokens, else: Map.put(tokens, "refresh_token", refresh_token)

    shim_spec = %{"scopes" => scope, "refresh_encoding" => "form", "refresh_lead_seconds" => 60}
    store_tokens(org_id, provider, label, "", shim_spec, tokens)
  end

  # ---------------------------------------------------------------------------
  # Account listing / revocation
  # ---------------------------------------------------------------------------

  @doc "Redacted account metadata — never token material."
  @spec list_accounts(String.t()) :: [map()]
  def list_accounts(org_id) do
    query_all!(
      "SELECT id, provider_name, label, status, scope, expires_at, created_at, updated_at " <>
        "FROM org_ai_oauth_accounts WHERE org_id = $1 ORDER BY provider_name, label",
      [org_id]
    )
  end

  @doc "Revoke one account; returns whether a row was deleted."
  @spec revoke(String.t(), String.t()) :: boolean()
  def revoke(org_id, account_id) do
    case query_one!("SELECT 1 AS x FROM org_ai_oauth_accounts WHERE id = $1 AND org_id = $2", [account_id, org_id]) do
      nil ->
        false

      _ ->
        execute!("DELETE FROM org_ai_oauth_accounts WHERE id = $1 AND org_id = $2", [account_id, org_id]) > 0
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp pkce_pair do
    verifier = :crypto.strong_rand_bytes(48) |> Base.url_encode64(padding: false)
    challenge = verifier |> :crypto.hash(:sha256) |> Base.url_encode64(padding: false)
    {verifier, challenge}
  end

  defp shim_spec(entry) do
    %{
      "token_url" => entry["token_url"] || "",
      "scopes" => entry["scope"] || "",
      "client_id_env" => entry["client_id_env"],
      "refresh_encoding" => "form",
      "refresh_lead_seconds" => 60
    }
  end

  defp trimmed_or(value, fallback) do
    case String.trim(value || "") do
      "" -> fallback
      trimmed -> trimmed
    end
  end

  defp parse_int(nil, default), do: default

  defp parse_int(value, _default) when is_integer(value), do: value

  defp parse_int(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {int, _} -> int
      :error -> default
    end
  end

  defp parse_int(value, _default) when is_float(value), do: trunc(value)
  defp parse_int(_, default), do: default
end
