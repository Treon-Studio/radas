defmodule RadasState.ProjectStatus do
  use Ecto.Schema
  import Ecto.Changeset

  @moduledoc """
  Project Dashboard & Status Tracking (see plans.md)
  """

  schema "project_statuses" do
    field :name, :string
    field :status, :string
    field :description, :string

    timestamps()
  end

  @doc false
  def changeset(project_status, attrs) do
    project_status
    |> cast(attrs, [:name, :status, :description])
    |> validate_required([:name, :status])
  end
end
