defmodule RadasAI.UserInviteService do
  @moduledoc """
  Port of `services/user_invite_service.py` (UC625) — invitation
  lifecycle with TTL, pre-assigned roles, org association and claiming.
  Invites live in the kv_store `user_invites` scope keyed by token
  (shared with Flask).
  """

  import RadasAI.DB

  alias RadasAI.Identity
  alias RadasAI.KV

  @scope "user_invites"
  @default_ttl 7 * 86400

  @doc "Create a pending invite; returns the record incl. its token."
  @spec create_user_invite(String.t(), [String.t()], String.t(), keyword()) :: map()
  def create_user_invite(email, roles, invited_by, opts \\ []) do
    token =
      :crypto.strong_rand_bytes(32)
      |> Base.url_encode64(padding: false)

    now = now_sec()

    invite = %{
      "token" => token,
      "email" => String.trim(String.downcase(email || "")),
      "roles" => (roles == [] and ["viewer"]) || roles || ["viewer"],
      "invited_by" => invited_by,
      "org_id" => Keyword.get(opts, :org_id),
      "status" => "pending",
      "created_at" => now,
      "expires_at" => now + (Keyword.get(opts, :ttl_seconds) || @default_ttl),
      "claimed_at" => nil,
      "claimed_by_user_id" => nil
    }

    KV.set(@scope, token, invite)
    invite
  end

  @doc "One invite with lazy expiration status, or nil."
  @spec get_user_invite(String.t()) :: map() | nil
  def get_user_invite(token) do
    case KV.get(@scope, token) do
      %{} = invite when map_size(invite) > 0 ->
        if invite["status"] == "pending" and now_sec() > (invite["expires_at"] || 0) do
          invite = Map.put(invite, "status", "expired")
          KV.set(@scope, token, invite)
          invite
        else
          invite
        end

      _ ->
        nil
    end
  end

  @doc "All invites, optionally org-filtered (lazy expiry, Python list_user_invites)."
  @spec list_user_invites(String.t() | nil) :: [map()]
  def list_user_invites(org_id \\ nil) do
    KV.list(@scope)
    |> Enum.map(& &1["value"])
    |> Enum.filter(&is_map/1)
    |> Enum.map(fn inv ->
      if inv["status"] == "pending" and now_sec() > (inv["expires_at"] || 0) do
        Map.put(inv, "status", "expired")
      else
        inv
      end
    end)
    |> Enum.filter(&(org_id in [nil, ""] or &1["org_id"] == org_id))
  end

  @doc "Revoke a pending invite; false when unknown."
  @spec revoke_user_invite(String.t()) :: boolean()
  def revoke_user_invite(token) do
    case get_user_invite(token) do
      nil ->
        false

      invite ->
        KV.set(@scope, token, Map.put(invite, "status", "revoked"))
        true
    end
  end

  @doc """
  Claim an invite: create the user account with the pre-assigned roles and
  join the invite's org. Raises ArgumentError on invalid/expired tokens.
  """
  @spec claim_user_invite(String.t(), String.t(), String.t()) :: map()
  def claim_user_invite(token, username, password) do
    invite = get_user_invite(token)

    if invite == nil do
      raise ArgumentError, message: "Invalid invitation token"
    end

    if invite["status"] != "pending" do
      raise ArgumentError, message: "Invitation is #{invite["status"]}, not pending"
    end

    case Identity.create_user(username: username, password: password, email: invite["email"]) do
      %{"id" => _} = user ->
        org_id = invite["org_id"]

        if org_id not in [nil, ""] do
          try do
            Identity.add_member(org_id, user["id"], hd(invite["roles"] || []) || "member")
          rescue
            _ -> nil
          end
        end

        now = now_sec()

        invite =
          invite
          |> Map.put("status", "claimed")
          |> Map.put("claimed_at", now)
          |> Map.put("claimed_by_user_id", user["id"])

        KV.set(@scope, token, invite)

        %{
          "success" => true,
          "user" => %{"id" => user["id"], "username" => user["username"], "email" => user["email"], "roles" => user["roles"] || []},
          "invite" => invite
        }

      {:error, msg} ->
        raise ArgumentError, message: msg
    end
  end

  defp now_sec, do: System.system_time(:second)
end
