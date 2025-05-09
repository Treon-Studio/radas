defmodule RadasState.Services.FeatureFlagServiceTest do
  use ExUnit.Case, async: true

  alias RadasState.Services.FeatureFlagService

  describe "after_create/1" do
    test "returns :ok for {:ok, feature_flag}" do
      feature_flag = %{key: "beta", enabled: true}
      assert :ok = FeatureFlagService.after_create({:ok, feature_flag})
    end
    test "returns :noop for error" do
      assert :noop = FeatureFlagService.after_create({:error, :fail})
    end
  end

  describe "after_update/1" do
    test "returns :ok for {:ok, feature_flag}" do
      feature_flag = %{key: "beta", enabled: false}
      assert :ok = FeatureFlagService.after_update({:ok, feature_flag})
    end
    test "returns :noop for error" do
      assert :noop = FeatureFlagService.after_update({:error, :fail})
    end
  end

  describe "after_delete/1" do
    test "returns :ok for {:ok, feature_flag}" do
      feature_flag = %{key: "beta", enabled: false}
      assert :ok = FeatureFlagService.after_delete({:ok, feature_flag})
    end
    test "returns :noop for error" do
      assert :noop = FeatureFlagService.after_delete({:error, :fail})
    end
  end
end
