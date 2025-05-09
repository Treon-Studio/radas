defmodule RadasState.Repo.Migrations.CreateNotes do
  use Ecto.Migration

  def change do
    create table(:notes) do
      add :title, :string, null: false
      add :content, :text, null: false
      add :tags, {:array, :string}, default: []

      timestamps()
    end
  end
end
