defmodule RadasAI.SSOAuthTest do
  use Radas.DataCase, async: false

  alias RadasAI.SSOAuth

  @sso_env [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "GITHUB_OAUTH_REDIRECT_URI"
  ]

  setup do
    original_env = Map.new(@sso_env, &{&1, System.get_env(&1)})

    Enum.each(@sso_env, &System.delete_env/1)

    on_exit(fn ->
      Enum.each(original_env, fn {name, value} ->
        if value, do: System.put_env(name, value), else: System.delete_env(name)
      end)
    end)

    :ok
  end

  test "providers remain disabled until their complete configuration is present" do
    refute SSOAuth.google_configured?()
    refute SSOAuth.github_configured?()

    System.put_env("GOOGLE_CLIENT_ID", "google-client")
    System.put_env("GOOGLE_CLIENT_SECRET", "google-secret")
    refute SSOAuth.google_configured?()

    System.put_env("GOOGLE_REDIRECT_URI", " ")
    refute SSOAuth.google_configured?()

    System.put_env("GOOGLE_REDIRECT_URI", "https://api.example.test/api/auth/google/callback")
    assert SSOAuth.google_configured?()

    System.put_env("GITHUB_OAUTH_CLIENT_ID", "github-client")
    System.put_env("GITHUB_OAUTH_CLIENT_SECRET", "github-secret")
    refute SSOAuth.github_configured?()

    System.put_env("GITHUB_OAUTH_REDIRECT_URI", "https://api.example.test/api/auth/github/callback")
    assert SSOAuth.github_configured?()
  end

  test "authorization URLs use only configured redirect URIs and never localhost defaults" do
    assert {:error, "Google SSO is not configured"} = SSOAuth.google_auth_url()
    assert {:error, "GitHub SSO is not configured"} = SSOAuth.github_auth_url()

    System.put_env("GOOGLE_CLIENT_ID", "google-client")
    System.put_env("GOOGLE_CLIENT_SECRET", "google-secret")
    System.put_env("GOOGLE_REDIRECT_URI", "https://api.example.test/api/auth/google/callback")

    assert {:ok, %{"url" => google_url, "state" => google_state}} = SSOAuth.google_auth_url()
    assert URI.decode_query(URI.parse(google_url).query)["redirect_uri"] == "https://api.example.test/api/auth/google/callback"

    state_row = RadasAI.DB.query_one!("SELECT value FROM kv_store WHERE scope = $1 AND key = $2", ["sso_state", google_state])
    assert state_row["value"] == %{
             "provider" => "google",
             "redirect_uri" => "https://api.example.test/api/auth/google/callback",
             "created_at" => state_row["value"]["created_at"]
           }

    System.put_env("GITHUB_OAUTH_CLIENT_ID", "github-client")
    System.put_env("GITHUB_OAUTH_CLIENT_SECRET", "github-secret")
    System.put_env("GITHUB_OAUTH_REDIRECT_URI", "https://api.example.test/api/auth/github/callback")

    assert {:ok, %{"url" => github_url}} = SSOAuth.github_auth_url()
    assert URI.decode_query(URI.parse(github_url).query)["redirect_uri"] == "https://api.example.test/api/auth/github/callback"
    refute google_url =~ "localhost"
    refute github_url =~ "localhost"
  end

  test "OAuth state is bound to its provider and consumed once, including a mismatched callback" do
    System.put_env("GOOGLE_CLIENT_ID", "google-client")
    System.put_env("GOOGLE_CLIENT_SECRET", "google-secret")
    System.put_env("GOOGLE_REDIRECT_URI", "https://api.example.test/api/auth/google/callback")

    assert {:ok, %{"state" => state}} = SSOAuth.google_auth_url()

    assert {:error, "OAuth state does not match this provider"} = SSOAuth.github_callback("code", state)
    refute RadasAI.DB.query_one!("SELECT value FROM kv_store WHERE scope = $1 AND key = $2", ["sso_state", state])
    assert {:error, "Unknown or expired OAuth state"} = SSOAuth.google_callback("code", state)
  end
end
