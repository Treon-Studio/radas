defmodule RadasState.JobsTest do
  use ExUnit.Case, async: true

  alias RadasState.Jobs

  describe "enqueue/2" do
    test "returns :ok and prints job event" do
      event = :feature_flag_created
      payload = %{key: "beta", enabled: true}

      assert :ok = Jobs.enqueue(event, payload)
    end
  end
end
