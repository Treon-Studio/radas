defmodule RadasWeb.Plugs.OrgAccess do
  @moduledoc """
  Port of `_org_access` in `api/ai_router_routes.py` plus the org-context
  resolver `_get_org_id_from_req`.

  Rules: internal/admin bypass; endpoint keys are read-only for /api/v1 usage
  and pinned to their org; members pass reads; owner/admin required for
  mutations.
  """

  import RadasAI.DB
  import Plug.Conn

  @doc "Resolve the active org_id from user claims, headers, params, or first org."
  @spec resolve_org_id(Plug.Conn.t()) :: String.t()
  def resolve_org_id(conn) do
    user = conn.assigns[:current_user] || %{}

    org_id =
      user["active_org_id"] || user["org_id"] ||
        get_req_header(conn, "x-org-id") |> List.first() ||
        conn.query_params["org_id"]

    org_id =
      if org_id in [nil, ""] do
        # Default fallback to primary workspace org.
        case query_one!("SELECT id FROM orgs ORDER BY created_at ASC LIMIT 1", []) do
          %{"id" => first} -> first
          nil -> "default-org"
        end
      else
        org_id
      end

    org_id || "default-org"
  end

  @doc """
  Enforce access for `org_id`; returns :ok or {:error, status, message}.

  `mutate: true` requires owner/admin (or platform admin role).
  """
  @spec check(Plug.Conn.t(), String.t(), keyword()) :: :ok | {:error, integer(), String.t()}
  def check(conn, org_id, opts \\ []) do
    user = conn.assigns[:current_user] || %{}
    mutate = Keyword.get(opts, :mutate, false)

    cond do
      user["username"] == "internal" or "admin" in List.wrap(user["roles"]) ->
        :ok

      user["endpoint_key"] ->
        cond do
          mutate -> {:error, 403, "owner/admin required"}
          org_id != user["org_id"] -> {:error, 403, "organization access denied"}
          true -> :ok
        end

      true ->
        user_id = user["user_id"]

        if user_id in [nil, ""] or not is_member?(org_id, user_id) do
          {:error, 403, "organization access denied"}
        else
          if mutate and member_role(org_id, user_id) not in ["owner", "admin"] do
            {:error, 403, "owner/admin required"}
          else
            :ok
          end
        end
    end
  end

  @doc "Whether a user belongs to an org (org_members lookup)."
  @spec is_member?(String.t(), String.t()) :: boolean()
  def is_member?(org_id, user_id) do
    query_one!("SELECT 1 AS x FROM org_members WHERE org_id = $1 AND user_id = $2", [org_id, user_id]) != nil
  end

  @doc "The user's role in an org, or nil."
  @spec member_role(String.t(), String.t()) :: String.t() | nil
  def member_role(org_id, user_id) do
    case query_one!("SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2", [org_id, user_id]) do
      %{"role" => role} -> role
      nil -> nil
    end
  end

  @doc "Apply the check result to a conn: continue or send the error."
  @spec apply_or_send(Plug.Conn.t(), :ok | {:error, integer(), String.t()}) :: Plug.Conn.t() | no_return()
  def apply_or_send(conn, :ok), do: conn

  def apply_or_send(conn, {:error, status, message}) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(%{"error" => message}))
    |> halt()
  end
end
