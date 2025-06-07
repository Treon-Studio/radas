defmodule RadasState.Repo.Migrations.CreateEnvironments do
  use Ecto.Migration

  def change do
    create table(:environments) do
      add :name, :string, null: false
      add :description, :text

      timestamps()
    end
  end
end
