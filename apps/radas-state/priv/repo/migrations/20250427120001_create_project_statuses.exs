defmodule RadasState.Repo.Migrations.CreateProjectStatuses do
  use Ecto.Migration

  def change do
    create table(:project_statuses) do
      add :name, :string, null: false
      add :status, :string, null: false
      add :description, :text

      timestamps()
    end
  end
end
