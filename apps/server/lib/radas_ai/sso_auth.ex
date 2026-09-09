defmodule RadasAI.SSOAuth do
  @moduledoc """
  Port of `services/google_oauth.py` + `services/github_oauth.py` — SSO
  login flows. Framework + token exchange + user provisioning; both providers
  are env-gated (`GOOGLE_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`) and stay
  "not configured" until an operator sets them, mirroring Python.
  """

  import RadasAI.DB

  @google_auth_url "https://accounts.google.com/o/oauth2/v2/auth"
  @google_token_url "https://oauth2.googleapis.com/token"
  @google_userinfo_url "https://www.googleapis.com/oauth2/v3/userinfo"
  @google_scopes ["openid", "email", "profile"]

  @github_authorize "https://github.com/login/oauth/authorize"
  @github_token_url "https://github.com/login/oauth/access_token"
  @github_api "https://api.github.com"

  # ---------------------------------------------------------------------------
  # Status / config
  # ---------------------------------------------------------------------------

  def google_configured? do
    configured?("GOOGLE_CLIENT_ID") and configured?("GOOGLE_CLIENT_SECRET") and configured?("GOOGLE_REDIRECT_URI")
  end

  def github_configured? do
    configured?("GITHUB_OAUTH_CLIENT_ID") and configured?("GITHUB_OAUTH_CLIENT_SECRET") and configured?("GITHUB_OAUTH_REDIRECT_URI")
  end

  def google_redirect_uri, do: configured_value("GOOGLE_REDIRECT_URI")
  def github_redirect_uri, do: configured_value("GITHUB_OAUTH_REDIRECT_URI")

  # ---------------------------------------------------------------------------
  # Google
  # ---------------------------------------------------------------------------

  @doc "Build the Google authorize URL with a signed state."
  @spec google_auth_url() :: {:ok, map()} | {:error, String.t()}
  def google_auth_url do
    with true <- google_configured?() || {:error, "Google SSO is not configured"},
         {:ok, redirect_uri} <- google_redirect_uri() do
      state = new_state("google", redirect_uri)

      params =
        URI.encode_query(%{
          "client_id" => env("GOOGLE_CLIENT_ID"),
          "redirect_uri" => redirect_uri,
          "response_type" => "code",
          "scope" => Enum.join(@google_scopes, " "),
          "state" => state,
          "access_type" => "offline",
          "prompt" => "consent"
        })

      {:ok, %{"url" => "#{@google_auth_url}?#{params}", "state" => state}}
    end
  end

  @doc "Exchange a Google code for a provisioned user; returns {:ok, user} | {:error, msg}."
  @spec google_callback(String.t(), String.t()) :: {:ok, map()} | {:error, String.t()}
  def google_callback(code, state) do
    with {:ok, %{"redirect_uri" => redirect_uri}} <- consume_state(state, "google"),
         {:ok, tokens} <- post_form(@google_token_url, %{
           "code" => code,
           "client_id" => env("GOOGLE_CLIENT_ID"),
           "client_secret" => env("GOOGLE_CLIENT_SECRET"),
           "redirect_uri" => redirect_uri,
           "grant_type" => "authorization_code"
         }),
         {:ok, profile} <- google_userinfo(tokens["access_token"]) do
      provision_sso_user("google", profile["sub"], profile["email"], profile["name"] || profile["email"])
    end
  end

  defp google_userinfo(access_token) do
    case Req.get(@google_userinfo_url,
           headers: [{"Authorization", "Bearer " <> access_token}],
           receive_timeout: 15_000,
           retry: false
         ) do
      {:ok, %Req.Response{status: s, body: body}} when s in 200..299 and is_map(body) -> {:ok, body}
      _ -> {:error, "Failed to fetch Google user info"}
    end
  end

  # ---------------------------------------------------------------------------
  # GitHub
  # ---------------------------------------------------------------------------

  @doc "Build the GitHub authorize URL with a signed state."
  @spec github_auth_url() :: {:ok, map()} | {:error, String.t()}
  def github_auth_url do
    with true <- github_configured?() || {:error, "GitHub SSO is not configured"},
         {:ok, redirect_uri} <- github_redirect_uri() do
      state = new_state("github", redirect_uri)

      params =
        URI.encode_query(%{
          "client_id" => env("GITHUB_OAUTH_CLIENT_ID"),
          "redirect_uri" => redirect_uri,
          "scope" => "read:user user:email",
          "state" => state
        })

      {:ok, %{"url" => "#{@github_authorize}?#{params}", "state" => state}}
    end
  end

  @doc "Exchange a GitHub code for a provisioned user."
  @spec github_callback(String.t(), String.t()) :: {:ok, map()} | {:error, String.t()}
  def github_callback(code, state) do
    with {:ok, %{"redirect_uri" => redirect_uri}} <- consume_state(state, "github"),
         {:ok, tokens} <- post_form(@github_token_url, %{
           "code" => code,
           "client_id" => env("GITHUB_OAUTH_CLIENT_ID"),
           "client_secret" => env("GITHUB_OAUTH_CLIENT_SECRET"),
           "redirect_uri" => redirect_uri,
           "accept" => "json"
         }),
         {:ok, profile} <- github_user(tokens["access_token"]) do
      provision_sso_user("github", to_string(profile["id"]), profile["email"] || "#{profile["login"]}@users.noreply.github.com", profile["login"])
    end
  end

  defp github_user(access_token) do
    case Req.get(@github_api <> "/user",
           headers: [
             {"Authorization", "Bearer " <> access_token},
             {"Accept", "application/vnd.github+json"},
             {"User-Agent", "radas"}
           ],
           receive_timeout: 15_000,
           retry: false
         ) do
      {:ok, %Req.Response{status: s, body: body}} when s in 200..299 and is_map(body) -> {:ok, body}
      _ -> {:error, "Failed to fetch GitHub user"}
    end
  end

  # ---------------------------------------------------------------------------
  # State + provisioning
  # ---------------------------------------------------------------------------

  defp new_state(provider, redirect_uri) do
    state = :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)

    RadasAI.DB.execute!(
      "INSERT INTO kv_store (scope, key, value, updated_at) VALUES ($1, $2, $3, $4) " <>
        "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
      ["sso_state", state, %{"provider" => provider, "redirect_uri" => redirect_uri, "created_at" => RadasAI.DB.now()}, RadasAI.DB.now()]
    )

    state
  end

  defp consume_state(state, expected_provider) do
    case query_one!("DELETE FROM kv_store WHERE scope = $1 AND key = $2 RETURNING value", ["sso_state", state]) do
      nil ->
        {:error, "Unknown or expired OAuth state"}

      %{"value" => %{"provider" => ^expected_provider, "redirect_uri" => redirect_uri} = stored_state} when is_binary(redirect_uri) and redirect_uri != "" ->
        {:ok, stored_state}

      %{"value" => %{"provider" => _provider}} ->
        {:error, "OAuth state does not match this provider"}

      _ ->
        {:error, "Invalid OAuth state"}
    end
  end

  @doc "Find-or-create an SSO user keyed by provider+subject; marks sso:<provider> role-less."
  @spec provision_sso_user(String.t(), String.t(), String.t(), String.t()) :: {:ok, map()}
  def provision_sso_user(provider, subject, email, _display_name) do
    username = "#{provider}_#{String.slice(String.replace(subject, ~r/[^a-zA-Z0-9_-]/, ""), 0, 30)}"

    case query_one!("SELECT id FROM users WHERE username = $1", [username]) do
      %{"id" => _id} ->
        {:ok, RadasAI.Identity.get_user_by_username(username)}

      nil ->
        case RadasAI.Identity.create_user(
               username: username,
               password: :crypto.strong_rand_bytes(24) |> Base.url_encode64(padding: false),
               email: email
             ) do
          {:error, msg} -> {:error, msg}
          user -> {:ok, user}
        end
    end
  end

  defp post_form(url, payload) do
    case Req.post(url,
           form: Map.new(payload, fn {k, v} -> {k, to_string(v)} end),
           headers: [{"Accept", "application/json"}],
           receive_timeout: 15_000,
           retry: false
         ) do
      {:ok, %Req.Response{status: s, body: body}} when s in 200..299 and is_map(body) ->
        if body["error"], do: {:error, to_string(body["error"])}, else: {:ok, body}

      {:ok, %Req.Response{status: s}} ->
        {:error, "Token endpoint returned HTTP #{s}"}

      {:error, _} ->
        {:error, "Token endpoint unreachable"}
    end
  end

  defp configured?(name), do: match?({:ok, _}, configured_value(name))

  defp configured_value(name) do
    case String.trim(env(name)) do
      "" -> {:error, "#{name} is not configured"}
      value -> {:ok, value}
    end
  end

  defp env(name), do: System.get_env(name) || ""
end
