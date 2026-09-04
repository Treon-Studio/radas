defmodule RadasAI.Ontology do
  @moduledoc """
  Port of `services/ontology.py` + `api/ontology_routes.py` — loads
  `contracts/domain-ontology.json`, the platform's semantic contract for
  entity states, transitions, relations, events, and alert rules. The
  ontology is descriptive: the parity test (`RadasOntologyParityTest`)
  fails when either side drifts.
  """

  # Compile-time cwd is apps/server_elixir — walk up to the repo contracts.
  @ontology_path (Path.expand(Path.join([File.cwd!(), "..", "..", "contracts", "domain-ontology.json"])))

  @ontology (case File.read(@ontology_path) do
               {:ok, binary} -> Jason.decode!(binary)
               _ -> %{"ontology_version" => "unknown", "entities" => %{}, "alerts" => %{}}
             end)

  @doc "Load (compile-time cached) ontology document."
  @spec load() :: map()
  def load, do: @ontology

  @doc "One entity's descriptor; raises on unknown names."
  @spec entity(String.t()) :: map()
  def entity(name) do
    Map.get(@ontology["entities"] || %{}, name) ||
      raise(KeyError, message: "unknown ontology entity: #{name}")
  end

  @doc "Entity state list."
  @spec states(String.t()) :: [String.t()]
  def states(name), do: List.wrap(entity(name)["states"])

  @doc "Entity transition map."
  @spec transitions(String.t()) :: %{String.t() => [String.t()]}
  def transitions(name), do: Map.new(entity(name)["transitions"] || %{}, fn {k, v} -> {k, List.wrap(v)} end)

  @doc "Entity final states."
  @spec final_states(String.t()) :: [String.t()]
  def final_states(name), do: List.wrap(entity(name)["final_states"])

  @doc "Alert rule set (desktop pet / console semantic contract)."
  @spec alert_rules() :: %{String.t() => map()}
  def alert_rules, do: @ontology["alerts"] || %{}
end
