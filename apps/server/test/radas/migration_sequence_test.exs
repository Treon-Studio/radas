defmodule Radas.MigrationSequenceTest do
  use ExUnit.Case, async: true

  @migrations_path Path.expand("../../priv/repo/migrations", __DIR__)

  test "empty schemas create orgs before migrations that reference them" do
    migrations =
      @migrations_path
      |> Path.join("*.exs")
      |> Path.wildcard()
      |> Enum.sort()

    migration_sql =
      Enum.map_join(migrations, "\n", fn migration ->
        migration
        |> File.read!()
        |> String.split("def up do", parts: 2)
        |> List.last()
      end)

    orgs_creation = "CREATE TABLE IF NOT EXISTS orgs"
    org_reference = "REFERENCES orgs(id)"

    assert String.contains?(migration_sql, orgs_creation)
    assert String.contains?(migration_sql, org_reference)

    assert :binary.match(migration_sql, orgs_creation) <
             :binary.match(migration_sql, org_reference),
           "orgs must be created before any statement that references it"
  end
end
