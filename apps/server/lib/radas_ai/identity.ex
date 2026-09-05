defmodule RadasAI.Identity do
  @moduledoc """
  Port of `services/org_service.py`, `services/user_service.py`,
  `services/role_service.py`, and the PermissionService — the identity domain
  over the shared PostgreSQL schema (orgs, org_members, users, user_roles,
  roles, role_permissions, permissions).
  """

  import RadasAI.DB

  alias RadasAI.AuthService

  # ---------------------------------------------------------------------------
  # Orgs (org_service.py)
  # ---------------------------------------------------------------------------

  @spec create_org(String.t(), String.t()) :: map()
  def create_org(name, creator_user_id) do
    org_id = "org-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))
    execute!("INSERT INTO orgs (id, name, created_by, created_at) VALUES ($1, $2, $3, $4)", [org_id, name, creator_user_id, now()])
    execute!("INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING", [org_id, creator_user_id])
    get_org(org_id)
  end

  @spec list_orgs_for_user(String.t()) :: [map()]
  def list_orgs_for_user(user_id), do: AuthService.orgs_for_user(user_id)

  @spec get_org(String.t()) :: map() | nil
  def get_org(org_id) do
    query_one!("SELECT id, name, created_by, created_at FROM orgs WHERE id = $1", [org_id])
  end

  @spec member_role(String.t(), String.t()) :: String.t() | nil
  def member_role(org_id, user_id) do
    case query_one!("SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2", [org_id, user_id]) do
      %{"role" => role} -> role
      nil -> nil
    end
  end

  @spec is_member?(String.t(), String.t()) :: boolean()
  def is_member?(org_id, user_id) do
    query_one!("SELECT 1 AS x FROM org_members WHERE org_id = $1 AND user_id = $2", [org_id, user_id]) != nil
  end

  @spec list_members(String.t()) :: [map()]
  def list_members(org_id) do
    query_all!(
      "SELECT om.user_id, om.role, u.username, u.email FROM org_members om LEFT JOIN users u ON u.id = om.user_id WHERE om.org_id = $1 ORDER BY om.user_id",
      [org_id]
    )
  end

  @spec add_member(String.t(), String.t(), String.t()) :: map()
  def add_member(org_id, user_id, role \\ "member") do
    execute!(
      "INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (org_id, user_id) DO NOTHING",
      [org_id, user_id, role]
    )

    %{"org_id" => org_id, "user_id" => user_id, "role" => role}
  end

  @spec set_member_role(String.t(), String.t(), String.t()) :: boolean()
  def set_member_role(org_id, user_id, role) do
    execute!("UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3", [role, org_id, user_id]) > 0
  end

  @spec remove_member(String.t(), String.t()) :: boolean()
  def remove_member(org_id, user_id) do
    execute!("DELETE FROM org_members WHERE org_id = $1 AND user_id = $2", [org_id, user_id]) > 0
  end

  @spec org_projects(String.t()) :: [map()]
  def org_projects(org_id) do
    query_all!("SELECT id, name FROM projects WHERE org_id = $1 ORDER BY created_at ASC", [org_id])
  end

  @doc "Project ids across every org the user belongs to."
  @spec accessible_project_ids(String.t()) :: [String.t()]
  def accessible_project_ids(user_id) do
    query_all!(
      "SELECT p.id FROM projects p JOIN org_members om ON om.org_id = p.org_id WHERE om.user_id = $1 ORDER BY p.created_at ASC",
      [user_id]
    )
    |> Enum.map(& &1["id"])
  end

  # ---------------------------------------------------------------------------
  # Users (user_service.py)
  # ---------------------------------------------------------------------------

  @user_cols "id, username, email, is_active, created_at, updated_at, last_login, disabled_at"

  @spec create_user(keyword()) :: map() | {:error, String.t()}
  def create_user(opts) do
    username = Keyword.fetch!(opts, :username)
    password = Keyword.fetch!(opts, :password)
    email = Keyword.get(opts, :email)
    is_active = Keyword.get(opts, :is_active, 1)

    with :ok <- RadasAI.Validators.validate_username(username),
         :ok <- RadasAI.Validators.validate_password(password),
         :ok <- RadasAI.Validators.validate_email(email) do
      if get_user_by_username(username) do
        {:error, "Username already exists"}
      else
        user_id = "user-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))
        ts = iso_now()

        execute!(
          "INSERT INTO users (id, username, email, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)",
          [user_id, username, email, AuthService.hash_password(password), is_active, ts]
        )

        for role_id <- Keyword.get(opts, :roles, []) do
          add_role_to_user(user_id, role_id)
        end

        get_user(user_id)
      end
    end
  end

  @spec get_all_users() :: [map()]
  def get_all_users do
    query_all!("SELECT #{@user_cols} FROM users ORDER BY created_at ASC")
    |> Enum.map(&enrich_user/1)
  end

  @spec get_user(String.t()) :: map() | nil
  def get_user(user_id) do
    query_one!("SELECT #{@user_cols} FROM users WHERE id = $1", [user_id])
    |> case do
      nil -> nil
      user -> enrich_user(user)
    end
  end

  @spec get_user_by_username(String.t()) :: map() | nil
  def get_user_by_username(username) do
    query_one!("SELECT #{@user_cols} FROM users WHERE username = $1", [username])
    |> case do
      nil -> nil
      user -> enrich_user(user)
    end
  end

  @doc "Update profile fields; returns the updated user or {:error, msg}."
  @spec update_user(String.t(), keyword()) :: map() | {:error, String.t()}
  def update_user(user_id, opts) do
    with %{} = _user <- get_user(user_id) || {:error, "User not found"} do
      changes = []

      changes =
        if email = Keyword.get(opts, :email) do
          changes ++ [{"email = $", email}]
        else
          changes
        end

      changes =
        if Keyword.has_key?(opts, :is_active) do
          changes ++ [{"is_active = $", (if Keyword.get(opts, :is_active), do: 1, else: 0)}]
        else
          changes
        end

      changes =
        if password = Keyword.get(opts, :password) do
          case RadasAI.Validators.validate_password(password) do
            :ok -> changes ++ [{"password_hash = $", AuthService.hash_password(password)}]
            {:error, msg} -> throw({:error, msg})
          end
        else
          changes
        end

      if changes == [] do
        get_user(user_id)
      else
        {set_clauses, params} =
          Enum.map_reduce(changes, [], fn {clause, value}, ps ->
            {"#{clause}#{length(ps) + 1}", ps ++ [value]}
          end)

        params = params ++ [DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601(), user_id]
        set_sql = Enum.join(set_clauses, ", ")

        case execute!("UPDATE users SET #{set_sql}, updated_at = $#{length(params) - 1} WHERE id = $#{length(params)}", params) do
          n when n >= 0 -> get_user(user_id)
        end
      end
    end
  catch
    {:error, msg} -> {:error, msg}
  end

  @spec delete_user(String.t()) :: boolean()
  def delete_user(user_id) do
    execute!("DELETE FROM user_roles WHERE user_id = $1", [user_id])
    execute!("DELETE FROM org_members WHERE user_id = $1", [user_id])
    execute!("DELETE FROM users WHERE id = $1", [user_id]) > 0
  end

  @spec add_role_to_user(String.t(), String.t()) :: boolean()
  def add_role_to_user(user_id, role_id) do
    execute!(
      "INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [user_id, role_id, iso_now()]
    ) >= 0
  end

  @spec remove_role_from_user(String.t(), String.t()) :: boolean()
  def remove_role_from_user(user_id, role_id) do
    execute!("DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2", [user_id, role_id]) > 0
  end

  defp enrich_user(user) do
    role_ids =
      query_all!("SELECT role_id FROM user_roles WHERE user_id = $1", [user["id"]])
      |> Enum.map(& &1["role_id"])

    Map.put(user, "roles", role_ids)
  end

  # ---------------------------------------------------------------------------
  # Roles (role_service.py)
  # ---------------------------------------------------------------------------

  @role_cols "id, name, description, is_system, created_at, updated_at"

  @spec create_role(String.t(), String.t(), keyword()) :: map() | {:error, String.t()}
  def create_role(name, description, opts \\ []) do
    if get_role_by_name(name) do
      {:error, "Role already exists"}
    else
      role_id = "role-" <> (:crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower))
      _ts = now()

      execute!(
        "INSERT INTO roles (id, name, description, is_system, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
        [role_id, name, description || "", (if Keyword.get(opts, :is_system, false), do: 1, else: 0), iso_now()]
      )

      get_role_by_id(role_id)
    end
  end

  @spec get_role_by_id(String.t()) :: map() | nil
  def get_role_by_id(role_id) do
    query_one!("SELECT #{@role_cols} FROM roles WHERE id = $1", [role_id])
    |> case do
      nil -> nil
      role -> enrich_role(role)
    end
  end

  @spec get_role_by_name(String.t()) :: map() | nil
  def get_role_by_name(name) do
    query_one!("SELECT #{@role_cols} FROM roles WHERE name = $1", [name])
    |> case do
      nil -> nil
      role -> enrich_role(role)
    end
  end

  @spec get_all_roles() :: [map()]
  def get_all_roles do
    query_all!("SELECT #{@role_cols} FROM roles ORDER BY name ASC") |> Enum.map(&enrich_role/1)
  end

  @spec update_role(String.t(), keyword()) :: map() | nil
  def update_role(role_id, opts) do
    with %{} <- get_role_by_id(role_id) do
      name = Keyword.get(opts, :name)
      description = Keyword.get(opts, :description)

      execute!(
        "UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = $3 WHERE id = $4",
        [name, description, iso_now(), role_id]
      )

      get_role_by_id(role_id)
    end
  end

  @spec delete_role(String.t()) :: boolean()
  def delete_role(role_id) do
    role = get_role_by_id(role_id)

    if role && role["is_system"] in [0, false, nil] do
      execute!("DELETE FROM role_permissions WHERE role_id = $1", [role_id])
      execute!("DELETE FROM user_roles WHERE role_id = $1", [role_id])
      execute!("DELETE FROM roles WHERE id = $1", [role_id]) > 0
    else
      false
    end
  end

  @spec add_permission_to_role(String.t(), String.t()) :: boolean()
  def add_permission_to_role(role_id, permission_id) do
    execute!(
      "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [role_id, permission_id]
    ) >= 0
  end

  @spec remove_permission_from_role(String.t(), String.t()) :: boolean()
  def remove_permission_from_role(role_id, permission_id) do
    execute!("DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2", [role_id, permission_id]) > 0
  end

  defp enrich_role(role) do
    permission_ids =
      query_all!("SELECT permission_id FROM role_permissions WHERE role_id = $1", [role["id"]])
      |> Enum.map(& &1["permission_id"])

    Map.put(role, "permissions", permission_ids)
  end

  # ---------------------------------------------------------------------------
  # Permissions (PermissionService)
  # ---------------------------------------------------------------------------

  @spec create_permission(String.t(), String.t(), String.t(), String.t()) :: map()
  def create_permission(id, name, description, resource_action) do
    {resource, action} = split_resource_action(resource_action)

    execute!(
      "INSERT INTO permissions (id, name, description, resource, action, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
      [id, name, description, resource, action, iso_now()]
    )

    get_permission(id)
  end

  @spec get_permission(String.t()) :: map() | nil
  def get_permission(perm_id) do
    query_one!("SELECT id, name, description, resource, action, created_at FROM permissions WHERE id = $1", [perm_id])
  end

  @spec get_all_permissions() :: [map()]
  def get_all_permissions do
    query_all!("SELECT id, name, description, resource, action, created_at FROM permissions ORDER BY name ASC")
  end

  @doc "Whether a user holds a permission name through any of their roles."
  @spec user_has_permission?(String.t(), String.t()) :: boolean()
  def user_has_permission?(user_id, permission_name) do
    query_one!(
      """
      SELECT 1 AS x FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND (p.name = $2 OR p.id = $2) LIMIT 1
      """,
      [user_id, permission_name]
    ) != nil
  end

  # SQLite-compat TEXT timestamp columns (users, roles, permissions,
  # user_roles) — Python writes `datetime.utcnow().isoformat()` strings.
  defp iso_now, do: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

  defp split_resource_action(ra) do
    case String.split(ra || "", ".", parts: 2) do
      [resource, action] -> {resource, action}
      [resource] -> {resource, "*"}
      [] -> {"", "*"}
    end
  end
end
