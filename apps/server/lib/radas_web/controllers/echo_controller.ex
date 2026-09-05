defmodule RadasWeb.EchoController do
  @moduledoc """
  Conformance probe for the platform contract (Phase 0 harness).

  Returns the request payload through `success_envelope` (redacted, with the
  authoritative request id). Lets contract smoke tests verify — against a
  running server — the exact behaviors clients depend on: envelope shape,
  redaction, and X-Request-ID/body request_id pairing. Not part of the
  product surface; excluded from the OpenAPI snapshot scope.
  """

  use RadasWeb, :controller

  alias Radas.Envelope
  alias Radas.RequestID

  def create(conn, params) do
    request_id = RequestID.current(conn) || RequestID.generate()
    json(conn, Envelope.success(params, request_id))
  end
end
