defmodule RadasState.Knowledge do
  use Ecto.Schema
  import Ecto.Changeset

  @moduledoc """
  Knowledge Management (Notes, etc, see plans.md)
  """

  schema "notes" do
    field :title, :string
    field :content, :string
    field :tags, {:array, :string}, default: []

    timestamps()
  end

  @doc false
  def changeset(knowledge, attrs) do
    knowledge
    |> cast(attrs, [:title, :content, :tags])
    |> validate_required([:title, :content])
  end
end
