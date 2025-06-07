defmodule RadasStateWeb.FeatureFlagJSON do
  def index(%{feature_flags: feature_flags}) do
    %{data: Enum.map(feature_flags, &feature_flag/1)}
  end

  def show(%{feature_flag: feature_flag}) do
    %{data: feature_flag(feature_flag)}
  end

  defp feature_flag(flag) do
    %{
      id: flag.id,
      name: flag.name,
      description: flag.description,
      type: flag.type,
      enabled: flag.enabled,
      inserted_at: flag.inserted_at,
      updated_at: flag.updated_at
    }
  end
end
