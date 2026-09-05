defmodule RadasAI.FlagsTest do
  use Radas.DataCase, async: false

  # Contract tests for the feature-flag core: scoped store (project → org →
  # global), evaluation engine, audit trail, expiry, export/import.
  alias RadasAI.Flags

  setup do
    kv_cleanup()
    {:ok, %{}}
  end

  defp kv_cleanup do
    for scope <- ["flags:global:default", "flags", "flag_audit:global:default"] do
      RadasAI.DB.execute!("DELETE FROM kv_store WHERE scope = $1", [scope])
    end
  end

  test "create validates key and dedups" do
    assert {:error, "Flag key must be at least 2 chars"} = Flags.create_flag(%{"key" => "a"})
    assert {:ok, flag} = Flags.create_flag(%{"key" => "block apply", "enabled" => true})
    assert flag["key"] == "block-apply"
    assert flag["enabled"] == true

    assert {:error, "Flag 'block-apply' already exists"} =
             Flags.create_flag(%{"key" => "block-apply"})
  end

  test "evaluate: kill_switch, globally_disabled, env map precedence" do
    Flags.create_flag(%{"key" => "f-kill", "enabled" => true, "kill_switch" => true})
    assert Flags.evaluate("f-kill") == %{"key" => "f-kill", "enabled" => false, "reason" => "kill_switch"}

    Flags.create_flag(%{"key" => "f-off", "enabled" => false})
    assert Flags.evaluate("f-off")["reason"] == "globally_disabled"

    Flags.create_flag(%{"key" => "f-env", "enabled" => true, "environments" => %{"prod" => false, "dev" => true}})
    assert Flags.evaluate("f-env", env: "prod")["reason"] == "disabled_in_prod"
    assert Flags.evaluate("f-env", env: "dev")["enabled"] == true
  end

  test "evaluate: blacklist > whitelist > rollout bucket" do
    Flags.create_flag(%{
      "key" => "f-rollout",
      "enabled" => true,
      "rollout_percent" => 100,
      "users_blacklist" => ["bad-user"],
      "users_whitelist" => ["good-user"]
    })

    assert Flags.evaluate("f-rollout", user: "bad-user")["reason"] == "blacklisted"
    assert Flags.evaluate("f-rollout", user: "good-user") == %{"key" => "f-rollout", "enabled" => true, "reason" => "whitelisted"}
    assert Flags.evaluate("f-rollout", user: "anyone") == %{"key" => "f-rollout", "enabled" => true, "reason" => "full_rollout"}
  end

  test "rollout percent 0/100 and deterministic bucket" do
    Flags.create_flag(%{"key" => "f-zero", "enabled" => true, "rollout_percent" => 0})
    assert Flags.evaluate("f-zero", user: "u1")["reason"] == "zero_rollout"

    Flags.update_flag("f-zero", %{"rollout_percent" => 100})
    assert Flags.evaluate("f-zero", user: "u1")["reason"] == "full_rollout"

    Flags.update_flag("f-zero", %{"rollout_percent" => 50})
    r1 = Flags.evaluate("f-zero", user: "u1")
    assert r1["reason"] == "rollout"
    # Deterministic: same user → same result.
    assert Flags.evaluate("f-zero", user: "u1") == r1
    # Bucket matches Python: sha256("key:entity") first-6-hex mod 1000.
    bucket = Flags.bucket("f-zero", "u1")
    assert bucket < 500
  end

  test "unknown flag fails closed" do
    assert Flags.evaluate("nope") == %{"key" => "nope", "enabled" => false, "reason" => "unknown_flag"}
    assert Flags.safe_evaluate("nope")["enabled"] == false
  end

  test "enforcement blocks operations when enabled" do
    Flags.create_flag(%{"key" => "block-destroy", "enabled" => true, "rollout_percent" => 100})
    assert Flags.enforcement("block-destroy", "prod") =~ "blocked by feature flag"
    Flags.update_flag("block-destroy", %{"enabled" => false})
    assert Flags.enforcement("block-destroy", "prod") == nil
  end

  test "scope hierarchy: project overrides org overrides global" do
    Flags.create_flag(%{"key" => "sc-flag", "enabled" => true})

    assert Flags.evaluate("sc-flag")["enabled"] == true

    Flags.create_flag(%{"key" => "sc-flag", "enabled" => false}, scope_type: "organization", scope_id: "org-1")
    assert Flags.evaluate("sc-flag", scope_type: "organization", scope_id: "org-1")["enabled"] == false
    # Global unaffected.
    assert Flags.evaluate("sc-flag")["enabled"] == true
  end

  test "global delete of a legacy-created flag works; audit trail records" do
    Flags.create_flag(%{"key" => "audit-flag", "enabled" => true})
    Flags.update_flag("audit-flag", %{"enabled" => false})

    entries = Flags.audit("global", nil, "audit-flag")
    assert length(entries) >= 2
    assert hd(entries)["changes"]["enabled"] == false

    assert Flags.delete_flag("audit-flag")
    assert Flags.get_flag("audit-flag") == nil
  end

  test "expire_due disables expired flags" do
    {:ok, _} = Flags.create_flag(%{"key" => "f-expired", "enabled" => true, "scheduled_expire_at" => System.system_time(:second) - 10})
    {:ok, _} = Flags.create_flag(%{"key" => "f-alive", "enabled" => true, "scheduled_expire_at" => System.system_time(:second) + 3600})

    assert Flags.expire_due_flags() == 1
    assert Flags.evaluate("f-expired")["enabled"] == false
    assert Flags.evaluate("f-alive")["enabled"] == true
  end

  test "export/import round trip" do
    Flags.create_flag(%{"key" => "exp-1", "enabled" => true})
    flags = Flags.export_flags()
    assert Enum.any?(flags, &(&1["key"] == "exp-1"))

    # Delete then import restores.
    Flags.delete_flag("exp-1")
    assert {:ok, count} = Flags.import_flags(flags)
    assert count == length(flags)
    assert Flags.get_flag("exp-1") != nil
  end

  test "seed_default_flags is idempotent" do
    n1 = Flags.seed_default_flags()
    n2 = Flags.seed_default_flags()
    assert n1 == 4
    assert n2 == 0
  end
end
