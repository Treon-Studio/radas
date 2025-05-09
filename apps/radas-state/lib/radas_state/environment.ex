defmodule RadasState.Environment do
  use Ecto.Schema
  import Ecto.Changeset

  @moduledoc """
  Environment Registry & Management (see plans.md)
  """

  schema "environments" do
    field :name, :string
    field :description, :string

    timestamps()
  end

  @doc false
  def changeset(environment, attrs) do
    environment
    |> cast(attrs, [:name, :description])
    |> validate_required([:name])
  end
end
