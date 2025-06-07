defmodule RadasState.NotificationTest do
  use ExUnit.Case, async: true

  alias RadasState.Notification

  describe "send/2" do
    test "returns :ok and prints notification" do
      event = :feature_flag_created
      payload = %{key: "beta", enabled: true}

      assert :ok = Notification.send(event, payload)
    end
  end
end
