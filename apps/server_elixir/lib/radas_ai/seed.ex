defmodule RadasAI.Seed do
  @moduledoc """
  Port of `auth/seed.py` — first-run bootstrap of base roles, permissions,
  and the initial admin user. The first-run admin password is NEVER
  hardcoded: it comes from ADMIN_INITIAL_PASSWORD or is generated and printed
  to stdout once.
  """

  import RadasAI.DB

  alias RadasAI.{AuthService, Identity}

  @base_permissions [
    {"roles.read", "View roles", "roles", "read"},
    {"roles.write", "Manage roles", "roles", "write"},
    {"users.read", "View users", "users", "read"},
    {"users.write", "Manage users", "users", "write"},
    {"projects.read", "View projects", "projects", "read"},
    {"projects.write", "Manage projects", "projects", "write"},
    {"executions.read", "View executions", "executions", "read"},
    {"executions.write", "Run executions", "executions", "write"}
  ]

  @base_roles [
    {"admin", "Full administrative access", true},
    {"member", "Standard member access", true},
    {"readonly", "Read-only access", true}
  ]

  @doc "Bootstrap roles, permissions, and the default admin; idempotent."
  @spec seed_all(keyword()) :: :ok
  def seed_all(opts \\ []) do
    seed_default_roles()
    seed_default_user(opts)
    :ok
  end

  def seed_default_roles do
    for {name, description, is_system} <- @base_roles do
      case Identity.create_role(name, description, is_system: is_system) do
        %{} = role -> :ok
        {:error, _} -> :ok
      end
    end

    for {perm_id, name, resource, action} <- @base_permissions do
      case Identity.create_permission(perm_id, name, "#{resource} #{action}", "#{resource}.#{action}") do
        %{} -> :ok
        nil -> :ok
      end
    end

    # Admin role gets every base permission.
    if admin = Identity.get_role_by_name("admin") do
      for {perm_id, _, _, _} <- @base_permissions do
        Identity.add_permission_to_role(admin["id"], perm_id)
      end
    end

    :ok
  end

  def seed_default_user(opts) do
    if Identity.get_user_by_username("admin") do
      :ok
    else
      initial_password =
        case System.get_env("ADMIN_INITIAL_PASSWORD") do
          pw when is_binary(pw) and pw != "" -> pw
          _ -> generated_password()
        end

      # No email (mirrors Python: None passes the validator; the operator
      # fills it in later via user management).
      case Identity.create_user(
             username: "admin",
             password: initial_password
           ) do
        {:error, msg} ->
          # Parity with Python: never crash boot on a seed collision.
          IO.puts("[seed] default admin not created: #{msg}")

        admin ->
          if admin_role = Identity.get_role_by_name("admin") do
            Identity.add_role_to_user(admin["id"], admin_role["id"])
          end

          IO.puts("""

          ==============================================
            Default admin user created
            Username : admin
            Password : #{initial_password}
            Capture this password now — it is shown once.
          ==============================================
          """)
      end

      :ok
    end
  end

  defp generated_password do
    # Always satisfies the validator's 3-of-4 class policy: pinned classes
    # (upper/digit/special) plus 18 url-safe random chars.
    "Adm-" <> (:crypto.strong_rand_bytes(14) |> Base.url_encode64(padding: false)) <> "!7"
  end
end
