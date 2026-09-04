defmodule RadasAI.CloudStateTest do
  use ExUnit.Case, async: false

  # Contract tests for the cloud_state port: audit JSONL, locks with
  # auto-release, version snapshots/rollback (cap 50), backend.hcl config —
  # all file paths shared with Flask via DATA_DIR/projects/<id>/<env>.
  alias RadasAI.CloudState

  @stack_dir "/tmp/radas-cs-stack"
  @data_dir "/tmp/radas-cs-data"

  setup do
    File.rm_rf!(@stack_dir)
    File.rm_rf!(@data_dir)
    File.mkdir_p!(@stack_dir)
    File.mkdir_p!(@data_dir)
    {:ok, stack_dir: @stack_dir, data_dir: @data_dir}
  end

  # -- audit ---------------------------------------------------------------

  test "append_audit writes JSONL; read_audit returns newest first" do
    CloudState.append_audit(@data_dir, "lock.acquired", "alice", %{"operation" => "apply"})
    CloudState.append_audit(@data_dir, "lock.released", "bob", %{})

    entries = CloudState.read_audit(@data_dir, 10)
    assert length(entries) == 2
    assert hd(entries)["event"] == "lock.released"
    assert hd(entries)["actor"] == "bob"
    assert Enum.at(entries, 1)["event"] == "lock.acquired"
  end

  test "audit read on missing dir returns empty and never raises" do
    assert CloudState.read_audit("/tmp/radas-cs-nope-dbg", 10) == []
  end

  # -- locks ------------------------------------------------------------------

  test "acquire takes the lock; second acquire is denied with the existing lock" do
    %{"ok" => true, "lock" => lock} = CloudState.acquire_lock(@data_dir, actor: "w1", operation: "apply")
    assert is_binary(lock["id"])
    assert lock["operation"] == "apply"

    %{"ok" => false, "lock" => existing} = CloudState.acquire_lock(@data_dir, actor: "w2", operation: "destroy")
    assert existing["who"] == "w1"
  end

  test "release honors lock id; force breaks it" do
    %{"ok" => true, "lock" => lock} = CloudState.acquire_lock(@data_dir, actor: "w1", operation: "apply")

    assert %{"ok" => false, "error" => msg} = CloudState.release_lock(@data_dir, lock_id: "wrong")
    assert msg =~ "mismatch"

    assert %{"ok" => true, "released" => true, "previous" => prev} =
             CloudState.release_lock(@data_dir, lock_id: lock["id"])

    assert prev["who"] == "w1"

    %{"ok" => true, "lock" => lock2} = CloudState.acquire_lock(@data_dir, actor: "w2", operation: "apply")
    assert %{"ok" => true, "released" => true} = CloudState.release_lock(@data_dir, lock_id: lock2["id"], force: true)
  end

  test "read_lock auto-releases when the owning execution finished" do
    CloudState.acquire_lock(@data_dir, actor: "w", operation: "apply", run_id: "exec-1")

    # Injected checker reports SUCCESS → auto-release.
    assert CloudState.read_lock(@data_dir, fn _id, _p -> %{"status" => "SUCCESS"} end, @project_id()) == nil
    refute File.exists?(Path.join(@data_dir, "state-lock.json"))
  end

  test "read_lock keeps the lock while the execution runs" do
    CloudState.acquire_lock(@data_dir, actor: "w", operation: "apply", run_id: "exec-2")
    lock = CloudState.read_lock(@data_dir, fn _id, _p -> %{"status" => "RUNNING"} end, @project_id())
    assert lock["operation"] == "apply"
    assert is_integer(lock["held_seconds"])
  end

  defp project_id, do: "proj-cs"

  # -- versions ------------------------------------------------------------

  test "snapshot_state writes versions and dedups identical content" do
    File.write!(Path.join(@stack_dir, "terraform.tfstate"), ~s({"version":4,"serial":1,"lineage":"abc","resources":[{"instances":[{}]}],"terraform_version":"1.9"}))

    entry = CloudState.snapshot_state(@stack_dir, @data_dir, actor: "a", reason: "test")
    assert entry["resource_count"] == 1
    assert entry["serial"] == 1
    assert entry["sha256"] != nil

    # Identical content → no new version.
    assert CloudState.snapshot_state(@stack_dir, @data_dir, actor: "a", reason: "dup") == nil
    assert length(CloudState.list_versions(@data_dir)) == 1
  end

  test "rollback_state restores the version and snapshots pre-rollback state" do
    File.write!(Path.join(@stack_dir, "terraform.tfstate"), ~s({"serial":1,"resources":[]}))
    entry = CloudState.snapshot_state(@stack_dir, @data_dir, actor: "a", reason: "test")

    # Change state, then roll back.
    File.write!(Path.join(@stack_dir, "terraform.tfstate"), ~s({"serial":2,"resources":[]}))
    {:ok, result} = CloudState.rollback_state(@stack_dir, @data_dir, entry["id"], actor: "a")
    assert result["version_id"] == entry["id"]

    restored = File.read!(Path.join(@stack_dir, "terraform.tfstate"))
    assert restored =~ ~s("serial":1)
  end

  test "rollback rejects invalid version ids" do
    assert {:error, "Invalid version id"} = CloudState.rollback_state(@stack_dir, @data_dir, "../evil", actor: "a")
  end

  test "state versions are capped at 50" do
    for i <- 1..55 do
      File.write!(Path.join(@stack_dir, "terraform.tfstate"), ~s({"serial":#{i},"resources":[]}))
      CloudState.snapshot_state(@stack_dir, @data_dir, actor: "a", reason: "auto-#{i}")
    end

    versions = CloudState.list_versions(@data_dir)
    assert length(versions) <= 50
    assert hd(versions)["serial"] == 55
  end

  # -- backend.hcl ----------------------------------------------------------

  test "write_backend_config validates values and reads back" do
    assert {:ok, cfg} = CloudState.write_backend_config(@stack_dir, @data_dir, %{"bucket" => "bkt", "key" => "path/tf", "region" => "us"}, actor: "a")
    assert cfg["configured"] == true
    assert cfg["values"]["bucket"] == "bkt"
    assert File.exists?(Path.join(@stack_dir, "backend.hcl"))
    assert File.read!(Path.join(@stack_dir, "backend.hcl")) =~ ~s(key = "path/tf")

    assert {:error, msg} = CloudState.write_backend_config(@stack_dir, @data_dir, %{"bucket" => "x\"y"}, actor: "a")
    assert msg =~ "Invalid value"
  end

  test "read_backend_config detects placeholder and backend type" do
    File.write!(Path.join(@stack_dir, "backend.hcl"), ~s(bucket = "REPLACE_ME"\nkey = "k"\n))
    File.write!(Path.join(@stack_dir, "backend.tf"), ~s(terraform {\n  backend "s3" {}\n}\n))

    cfg = CloudState.read_backend_config(@stack_dir)
    assert cfg["backend_type"] == "s3"
    assert cfg["placeholder"] == true
    assert cfg["configured"] == false
  end

  test "summarize_state handles corrupt state" do
    summary = CloudState.summarize_state("not-json")
    assert summary["resource_count"] == 0
    assert summary["serial"] == nil
  end
end
