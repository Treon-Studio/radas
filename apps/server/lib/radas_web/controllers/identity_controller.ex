defmodule RadasWeb.IdentityController do
  @moduledoc """
  Port of `api/org_routes.py`, `api/users_routes.py`, and the RBAC half of
  `api/roles_routes.py`: orgs + members, users + role assignment, and
  roles/permissions CRUD. All routes authenticate via
  `RadasWeb.Plugs.Auth` (JWT or internal-call); org mutations require the
  owner/admin role in that org; user/role management requires the admin role.
  """

  use RadasWeb, :controller

  import Plug.Conn

  alias RadasAI.Identity

  # -- Orgs --------------------------------------------------------------------

  def orgs_list(conn, _params) do
    user = current_user(conn)
    json(conn, %{"orgs" => Identity.list_orgs_for_user(user["user_id"])})
  end

  def orgs_create(conn, _params) do
    name = String.trim(to_string(conn.body_params["name"] || ""))

    if name == "" do
      conn |> put_status(400) |> json(%{"error" => "name required"})
    else
      org = Identity.create_org(name, current_user(conn)["user_id"])
      json(conn, %{"success" => true, "org" => org})
    end
  end

  def orgs_show(conn, %{"org_id" => org_id}) do
    case Identity.get_org(org_id) do
      nil -> conn |> put_status(404) |> json(%{"error" => "Organization not found"})
      org -> json(conn, %{"org" => org})
    end
  end

  def members_list(conn, %{"org_id" => org_id}) do
    if member?(conn, org_id) do
      json(conn, %{"members" => Identity.list_members(org_id)})
    else
      conn |> put_status(403) |> json(%{"error" => "organization access denied"})
    end
  end

  def members_add(conn, %{"org_id" => org_id}) do
    if owner?(conn, org_id) do
      user_id = to_string(conn.body_params["user_id"] || "")
      role = to_string(conn.body_params["role"] || "member")

      if user_id == "" do
        conn |> put_status(400) |> json(%{"error" => "user_id required"})
      else
        member = Identity.add_member(org_id, user_id, role)
        json(conn, %{"success" => true, "member" => member})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "owner/admin required"})
    end
  end

  def members_set_role(conn, %{"org_id" => org_id, "user_id" => user_id}) do
    if owner?(conn, org_id) do
      role = to_string(conn.body_params["role"] || "")

      if role in ["owner", "admin", "member"] do
        json(conn, %{"success" => Identity.set_member_role(org_id, user_id, role)})
      else
        conn |> put_status(400) |> json(%{"error" => "role must be owner, admin, or member"})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "owner/admin required"})
    end
  end

  def members_remove(conn, %{"org_id" => org_id, "user_id" => user_id}) do
    if owner?(conn, org_id) do
      json(conn, %{"success" => Identity.remove_member(org_id, user_id)})
    else
      conn |> put_status(403) |> json(%{"error" => "owner/admin required"})
    end
  end

  # -- Users ---------------------------------------------------------------------

  def users_list(conn, _params) do
    if admin?(conn) do
      json(conn, %{"success" => true, "users" => Identity.get_all_users()})
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def users_create(conn, _params) do
    if admin?(conn) do
      data = conn.body_params

      case Identity.create_user(
             username: to_string(data["username"] || ""),
             password: to_string(data["password"] || ""),
             email: present(data["email"]),
             is_active: 1
           ) do
        {:error, msg} -> conn |> put_status(400) |> json(%{"success" => false, "error" => msg})
        user -> json(conn, %{"success" => true, "user" => user})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def users_show(conn, %{"user_id" => user_id}) do
    if admin?(conn) or current_user(conn)["user_id"] == user_id do
      case Identity.get_user(user_id) do
        nil -> conn |> put_status(404) |> json(%{"error" => "User not found"})
        user -> json(conn, %{"success" => true, "user" => user})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def users_update(conn, %{"user_id" => user_id}) do
    if admin?(conn) do
      data = conn.body_params

      opts =
        []
        |> then(&if(data["email"] != nil, do: &1 ++ [email: to_string(data["email"])], else: &1))
        |> then(&if(data["password"] not in [nil, ""], do: &1 ++ [password: to_string(data["password"])], else: &1))
        |> then(&if(data["is_active"] != nil, do: &1 ++ [is_active: truthy(data["is_active"])], else: &1))

      case Identity.update_user(user_id, opts) do
        {:error, msg} -> conn |> put_status(400) |> json(%{"success" => false, "error" => msg})
        user -> json(conn, %{"success" => true, "user" => user})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def users_delete(conn, %{"user_id" => user_id}) do
    if admin?(conn) do
      json(conn, %{"success" => Identity.delete_user(user_id)})
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def users_add_role(conn, %{"user_id" => user_id}) do
    if admin?(conn) do
      role_id = to_string(conn.body_params["role_id"] || "")

      if role_id == "" or Identity.get_role_by_id(role_id) == nil do
        conn |> put_status(404) |> json(%{"success" => false, "error" => "Role not found"})
      else
        json(conn, %{"success" => Identity.add_role_to_user(user_id, role_id)})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  # -- Roles (RBAC) ----------------------------------------------------------------

  def roles_list(conn, _params) do
    json(conn, %{"success" => true, "roles" => Identity.get_all_roles()})
  end

  def roles_create(conn, _params) do
    if admin?(conn) do
      data = conn.body_params

      case Identity.create_role(
             to_string(data["name"] || ""),
             to_string(data["description"] || "")
           ) do
        {:error, msg} -> conn |> put_status(400) |> json(%{"success" => false, "error" => msg})
        role -> json(conn, %{"success" => true, "role" => role})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def roles_show(conn, %{"role_id" => role_id}) do
    case Identity.get_role_by_id(role_id) do
      nil -> conn |> put_status(404) |> json(%{"error" => "Role not found"})
      role -> json(conn, %{"success" => true, "role" => role})
    end
  end

  def roles_update(conn, %{"role_id" => role_id}) do
    if admin?(conn) do
      data = conn.body_params

      case Identity.update_role(role_id,
             name: present(data["name"]) && to_string(data["name"]),
             description: present(data["description"]) && to_string(data["description"])
           ) do
        nil -> conn |> put_status(404) |> json(%{"error" => "Role not found"})
        role -> json(conn, %{"success" => true, "role" => role})
      end
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  def roles_delete(conn, %{"role_id" => role_id}) do
    if admin?(conn) do
      json(conn, %{"success" => Identity.delete_role(role_id)})
    else
      conn |> put_status(403) |> json(%{"error" => "Admin access required"})
    end
  end

  # -- Permissions -------------------------------------------------------------------

  def permissions_list(conn, _params) do
    json(conn, %{"success" => true, "permissions" => Identity.get_all_permissions()})
  end

  def permissions_show(conn, %{"perm_id" => perm_id}) do
    case Identity.get_permission(perm_id) do
      nil -> conn |> put_status(404) |> json(%{"error" => "Permission not found"})
      perm -> json(conn, %{"success" => true, "permission" => perm})
    end
  end

  # -- helpers ---------------------------------------------------------------------------

  defp current_user(conn), do: conn.assigns[:current_user] || %{}

  defp admin?(conn) do
    user = current_user(conn)
    "admin" in List.wrap(user["roles"]) or user["username"] == "internal"
  end

  defp member?(conn, org_id) do
    user = current_user(conn)
    admin?(conn) or Identity.is_member?(org_id, user["user_id"])
  end

  defp owner?(conn, org_id) do
    user = current_user(conn)
    admin?(conn) or Identity.member_role(org_id, user["user_id"]) in ["owner", "admin"]
  end

  defp present(nil), do: nil
  defp present(""), do: nil
  defp present(value), do: value

  defp truthy(v) when v in [true, 1, "1", "true"], do: true
  defp truthy(_), do: false
end
