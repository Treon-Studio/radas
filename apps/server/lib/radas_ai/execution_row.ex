defmodule RadasAI.ExecutionRow do
  @moduledoc "Ecto schema over the shared `executions` table (jsonb `data`)."

  use Ecto.Schema

  @primary_key {:id, :string, autogenerate: false}
  schema "executions" do
    field :project_id, :string, source: :project_id
    field :data, :map
    field :created_at, :float
  end
end
