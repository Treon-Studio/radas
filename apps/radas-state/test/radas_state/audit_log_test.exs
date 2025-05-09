defmodule RadasState.AuditLogTest do
  use ExUnit.Case, async: true

  alias RadasState.AuditLog

  describe "log/3" do
    test "returns :ok and prints audit log" do
      event = :create
      type = :feature_flag
      payload = %{key: "beta", enabled: true}

      assert :ok = AuditLog.log(event, type, payload)
    end
  end
end
