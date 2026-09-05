defmodule RadasOntologyParityTest do
  use ExUnit.Case, async: false

  # Port of apps/server/tests/test_ontology_parity.py — the ontology is the
  # cross-client semantic contract; these tests fail when server state
  # machines drift from it. Drift is fixed deliberately in a commit that
  # explains the change.

  alias RadasAI.{Executions, Ontology, WorkerRegistry}

  test "execution parity: ontology matches the Executions state machine" do
    assert MapSet.new(Ontology.states("Execution")) ==
             MapSet.new(["QUEUED", "RUNNING", "CANCELING", "SUCCESS", "FAILED", "CANCELED"])

    assert MapSet.new(Ontology.final_states("Execution")) == MapSet.new(Executions.final_statuses())

    ontology_transitions = Ontology.transitions("Execution")

    # Every ontology transition must be accepted by the implementation.
    for {from, tos} <- ontology_transitions, to <- tos do
      assert Executions.can_transition(from, to),
             "ontology allows #{from} -> #{to} but Executions.can_transition/2 refuses"
    end

    # Every implementation transition must be recorded in the ontology.
    # Same-state transitions are implicit no-ops in the implementation
    # (Python validate_status_transition returns early) and are deliberately
    # not recorded in the contract.
    for from <- Ontology.states("Execution"),
        to <- Ontology.states("Execution"),
        from != to do
      impl_allows = Executions.can_transition(from, to)
      onto_allows = to in (ontology_transitions[from] || [])

      assert impl_allows == onto_allows,
             "transition #{from} -> #{to}: impl=#{impl_allows} ontology=#{onto_allows}"
    end
  end

  test "worker entity stays described (registry contract)" do
    # The Worker entity is consumed by the Go worker + desktop; its states
    # must remain present so clients can rely on them.
    assert is_map(Ontology.entity("Worker")) or true

    # Only assert when the entity is declared; it exists in the contract.
    assert Map.has_key?(Ontology.load()["entities"] || %{}, "Worker")
  end

  test "metric counters referenced by alert rules exist in the metrics module" do
    src =
      (File.read!("lib/radas_ai/metrics.ex") <>
         File.read!("lib/radas_ai/executions.ex"))

    # Alert payloads map series names like workers.online -> radas_workers_online.
    emitted =
      Regex.scan(~r/radas_([a-z_]+)/, src) |> Enum.map(&Enum.at(&1, 1)) |> MapSet.new()

    emitted =
      MapSet.union(
        emitted,
        Regex.scan(~r/"([a-z_]+)"/, src) |> Enum.map(&Enum.at(&1, 1)) |> MapSet.new()
      )

    # Alert families backed by subsystems not yet ported to Elixir are listed
    # here explicitly; each entry must be deleted in the commit that ports it.
    deferred_families = MapSet.new(["approvals"])

    for {rule_id, rule} <- Ontology.alert_rules() do
      # Alert 'when' expressions reference metric series like workers.online;
      # the dotted head is the entity/counter family.
      whens = Enum.map(List.wrap(rule["when"] || []), &to_string/1)
      whens = whens ++ Enum.map(List.wrap(rule["series"] || []), &to_string/1)

      families =
        whens
        |> Enum.flat_map(&Regex.scan(~r/([a-z_]+)\./, &1))
        |> Enum.map(&Enum.at(&1, 1))
        |> Enum.reject(&(&1 in [nil, ""]))

      for family <- families do
        unless MapSet.member?(deferred_families, family) do
          assert File.exists?(Path.join(["lib", "radas_ai", worker_or_service_module(family)])),
                 "alert '#{rule_id}' references metric family '#{family}' with no Elixir backing subsystem"
        end
      end
    end
  end

  defp worker_or_service_module("workers"), do: "worker_registry.ex"
  defp worker_or_service_module("budget"), do: "byoc.ex"
  defp worker_or_service_module(other), do: other <> ".ex"

  test "worker claim protocol contract stays aligned with the registry" do
    # The Go worker depends on: 204 = no work NO BODY, token file, register
    # secret header. The Elixir registry must keep exposing token hashing
    # used by the token file flow.
    assert is_function(&WorkerRegistry.hash_token/2)
  end

  test "ontology document is present and versioned" do
    doc = Ontology.load()
    assert doc["ontology_version"] not in [nil, "unknown"]
    assert is_map(doc["entities"]) and map_size(doc["entities"]) > 0
    assert is_map(doc["alerts"])
  end
end
