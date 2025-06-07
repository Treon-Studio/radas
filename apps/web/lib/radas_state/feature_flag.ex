defmodule RadasState.FeatureFlag do
  use Ecto.Schema
  import Ecto.Changeset

  @moduledoc """
  Feature Flag System (see plans.md)
  """

  schema "feature_flags" do
    field :name, :string
    field :description, :string
    field :type, :string
    field :enabled, :boolean, default: false

    timestamps()
  end

  @doc false
  def changeset(feature_flag, attrs) do
    feature_flag
    |> cast(attrs, [:name, :description, :type, :enabled])
    |> validate_required([:name, :type])
  end
end
