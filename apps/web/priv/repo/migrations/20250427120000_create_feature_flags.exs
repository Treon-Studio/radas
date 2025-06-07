defmodule RadasState.Repo.Migrations.CreateFeatureFlags do
  use Ecto.Migration

  def change do
    create table(:feature_flags) do
      add :name, :string, null: false
      add :description, :text
      add :type, :string, null: false
      add :enabled, :boolean, default: false

      timestamps()
    end
  end
end
