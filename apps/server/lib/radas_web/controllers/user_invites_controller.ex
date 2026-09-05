defmodule RadasWeb.UserInvitesController do
  @moduledoc """
  Port of `api/user_invite_routes.py` (UC625): invitation create/list/get/
  claim/revoke. GET-by-token and claim stay public (the invitee has no
  account yet), matching the Python decorators.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.UserInviteService

  def create(conn, _params) do
    data = conn.body_params || %{}
    email = String.trim(to_string(data["email"] || ""))

    if email == "" do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Email is required"})
    else
      user = conn.assigns[:current_user] || %{}
      ttl = parse_int(data["ttl_seconds"], 7 * 86400)

      invite =
        UserInviteService.create_user_invite(email, data["roles"] || ["viewer"], user["user_id"] || "admin",
          org_id: data["org_id"],
          ttl_seconds: ttl
        )

      conn |> put_status(201) |> json(%{"success" => true, "invite" => invite})
    end
  end

  def list(conn, _params) do
    invites = UserInviteService.list_user_invites(conn.query_params["org_id"])
    json(conn, %{"success" => true, "invites" => invites, "count" => length(invites)})
  end

  def show(conn, %{"token" => token}) do
    case UserInviteService.get_user_invite(token) do
      nil -> conn |> put_status(404) |> json(%{"success" => false, "error" => "Invitation not found"})
      invite -> json(conn, %{"success" => true, "invite" => invite})
    end
  end

  def claim(conn, %{"token" => token}) do
    data = conn.body_params || %{}
    username = String.trim(to_string(data["username"] || ""))
    password = to_string(data["password"] || "")

    if username == "" or password == "" do
      conn |> put_status(400) |> json(%{"success" => false, "error" => "Username and password are required"})
    else
      try do
        json(conn, UserInviteService.claim_user_invite(token, username, password))
      rescue
        e in ArgumentError -> conn |> put_status(400) |> json(%{"success" => false, "error" => e.message})
      end
    end
  end

  def revoke(conn, %{"token" => token}) do
    if UserInviteService.revoke_user_invite(token) do
      json(conn, %{"success" => true, "message" => "Invitation revoked"})
    else
      conn |> put_status(404) |> json(%{"success" => false, "error" => "Invitation not found"})
    end
  end

  defp parse_int(v, default) when is_integer(v), do: v

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> default
    end
  end

  defp parse_int(_, default), do: default
end
