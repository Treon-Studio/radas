defmodule RadasWeb.OntologyController do
  @moduledoc """
  Port of `api/ontology_routes.py` — read-only semantic-contract routes.
  `GET /api/ontology` returns the ontology document itself as `data`
  (clients read `data.ontology_version` / `data.entities` directly);
  `GET /api/ontology/alerts` nests the rule set under `data.alerts`.
  """

  use RadasWeb, :controller

  alias Radas.Envelope
  alias Radas.RequestID
  alias RadasAI.Ontology

  def show(conn, _params) do
    request_id = RequestID.current(conn) || RequestID.generate()
    json(conn, Envelope.success(Ontology.load(), request_id))
  end

  def alerts(conn, _params) do
    request_id = RequestID.current(conn) || RequestID.generate()
    json(conn, Envelope.success(%{"alerts" => Ontology.alert_rules()}, request_id))
  end
end
