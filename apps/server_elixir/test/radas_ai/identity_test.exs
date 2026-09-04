defmodule RadasAI.IdentityTest do
  use Radas.DataCase, async: false

  # Contract tests for the identity domain (orgs/users/roles/permissions)
  # ported from org_service.py, user_service.py, and role_service.py.
  alias RadasAI.{AuthService, Identity, Seed, Validators}

  @org "org-identity-e2e"

  setup do
    System.put_env("JWT_SECRET_KEY", "identity-e2e-jwt-000000")
    on_exit(fn -> System.delete_env("JWT_SECRET_KEY") end)

    RadasAI.DB.execute!("DELETE FROM users WHERE id LIKE 'user-ident-%' OR username LIKE 'ident_%'", [])
    RadasAI.DB.execute!(
      "INSERT INTO orgs (id, name, created_at) VALUES ($1, 'Identity E2E', 0) ON CONFLICT (id) DO NOTHING",
      [@org]
    )

    Seed.seed_all()

    {:ok, org: @org}
  end

  # -- Validators ---------------------------------------------------------------

  test "username policy" do
    assert Validators.validate_username("ab") == {:error, "Username must contain at least 3 characters"}
    assert Validators.validate_username("bad name!") == {:error, "Username can only contain letters, numbers, underscores and hyphens"}
    assert Validators.validate_username("ok_name-1") == :ok
    assert Validators.validate_username("") == {:error, "Username is required"}
  end

  test "password policy: 3 of 4 classes, min 12 chars" do
    assert Validators.validate_password("short1A!") == {:error, "Password must contain at least 12 characters"}
    assert Validators.validate_password("alllowercase123") == {:error, "Password must include at least three of: uppercase, lowercase, digit, special character"}
    assert Validators.validate_password("GoodPass123!") == :ok
    assert Validators.validate_password(nil) == {:error, "Password is required"}
  end

  # -- Seed ---------------------------------------------------------------------

  test "seed is idempotent and wires admin permissions", %{org: _org} do
    Seed.seed_all()
    roles_before = Identity.get_all_roles()
    Seed.seed_all()
    roles_after = Identity.get_all_roles()
    assert length(roles_before) == length(roles_after)

    admin = Identity.get_role_by_name("admin")
    assert admin["is_system"] in [1, true]
    assert "users.write" in admin["permissions"]
    assert Identity.get_user_by_username("admin") != nil
  end

  # -- Orgs -----------------------------------------------------------------------

  test "create_org makes the creator owner; member CRUD works", %{org: org} do
    owner = user!("ident_owner")
    org_row = Identity.create_org("Identity E2E Org", owner["id"])
    assert org_row["name"] == "Identity E2E Org"
    assert Identity.member_role(org_row["id"], owner["id"]) == "owner"

    member = user!("ident_member")
    Identity.add_member(org_row["id"], member["id"])
    assert Identity.is_member?(org_row["id"], member["id"])

    Identity.set_member_role(org_row["id"], member["id"], "admin")
    assert Identity.member_role(org_row["id"], member["id"]) == "admin"

    members = Identity.list_members(org_row["id"])
    assert length(members) == 2

    assert Identity.remove_member(org_row["id"], member["id"])
    refute Identity.is_member?(org_row["id"], member["id"])

    _ = org
  end

  test "org membership gates project access", %{org: org} do
    owner = user!("ident_owner2")
    Identity.add_member(org, owner["id"])

    RadasAI.DB.execute!(
      "INSERT INTO projects (id, org_id, name) VALUES ($1, $2, 'p1') ON CONFLICT (id) DO NOTHING",
      ["proj-ident-1", org]
    )

    assert ["proj-ident-1"] = Identity.accessible_project_ids(owner["id"])
  end

  # -- Users ------------------------------------------------------------------------

  test "create_user validates, hashes, and dedups usernames" do
    user = user!("ident_u1")
    assert user["email"] == "ident_u1@example.com"
    assert user["roles"] == []

    assert {:error, "Username already exists"} =
             Identity.create_user(username: "ident_u1", password: "StrongPass123x!")

    assert {:error, "Username must contain at least 3 characters"} =
             Identity.create_user(username: "ab", password: "StrongPass123x!")
  end

  test "authenticate rejects inactive users" do
    user = user!("ident_inactive")
    Identity.update_user(user["id"], is_active: false)
    assert AuthService.authenticate("ident_inactive", "StrongPass123x!") == nil
  end

  test "update_user changes password and profile" do
    user = user!("ident_u2")

    updated = Identity.update_user(user["id"], email: "new@example.com", password: "NewPassword456!")
    assert updated["email"] == "new@example.com"
    assert AuthService.authenticate("ident_u2", "NewPassword456!") != nil

    assert {:error, "Password must contain at least 12 characters"} =
             Identity.update_user(user["id"], password: "short")

    assert Identity.delete_user(user["id"])
    assert Identity.get_user(user["id"]) == nil
  end

  # -- Roles --------------------------------------------------------------------------

  test "role CRUD honors is_system protection" do
    role = Identity.create_role("ident_deploy", "Deploy role")
    assert role["name"] == "ident_deploy"

    updated = Identity.update_role(role["id"], description: "Updated")
    assert updated["description"] == "Updated"

    assert Identity.delete_role(role["id"])
    assert Identity.get_role_by_id(role["id"]) == nil

    admin = Identity.get_role_by_name("admin")
    refute Identity.delete_role(admin["id"]), "system roles cannot be deleted"
  end

  test "permissions bind to roles and user_has_permission resolves them" do
    user = user!("ident_perm")
    role = Identity.create_role("ident_viewer", "Viewer")
    Identity.add_role_to_user(user["id"], role["id"])

    refute Identity.user_has_permission?(user["id"], "projects.read")
    perm = Identity.get_permission("projects.read")
    Identity.add_permission_to_role(role["id"], perm["id"])
    assert Identity.user_has_permission?(user["id"], "projects.read")

    Identity.remove_permission_from_role(role["id"], perm["id"])
    refute Identity.user_has_permission?(user["id"], "projects.read")
  end

  # -- helpers ---------------------------------------------------------------------------

  defp user!(name) do
    case Identity.get_user_by_username(name) do
      nil ->
        Identity.create_user(
          username: name,
          password: "StrongPass123x!",
          email: "#{name}@example.com"
        )

      user ->
        user
    end
  end
end
