defmodule RadasWeb.Plugs.PlatformContract do
  @moduledoc """
  Port of `platform_contracts.py::register_platform_contracts`.

  Opts the platform namespace into request IDs and safe error finalization:

  - Platform namespace: `/api/platform/*`, `/api/v2/*`,
    `/api/projects/<id>/services*` (exact legacy mirrors stay outside).
  - Resolves the authoritative request ID before the controller runs.
  - After the response is rendered: normalizes errors (`>= 400`) into the
    error envelope and stamps `X-Request-ID` so it always equals the body
    `request_id`.

  Deliberately does not log exception text: provider exceptions routinely
  contain credentials.
  """

  import Plug.Conn

  alias Radas.RequestID

  @legacy_platform_paths ["/api/platform/idempotency"]
  @v2_legacy_platform_paths ["/api/v2/platform/idempotency"]
  @service_route_re ~r{^/api/projects/[^/]+/services(?:/|$)}

  def init(opts), do: opts

  def call(conn, _opts) do
    if platform_request?(conn.request_path) do
      conn
      |> RequestID.put(nil)
      |> register_before_send(&finalize/1)
    else
      conn
    end
  end

  @doc "Whether the request path uses the additive contract namespace."
  def platform_request?(path) when is_binary(path) do
    cond do
      path == "/api/v2" or String.starts_with?(path, "/api/v2/") ->
        path not in @v2_legacy_platform_paths

      path == "/api/platform" or String.starts_with?(path, "/api/platform/") ->
        path not in @legacy_platform_paths

      # Bootstrap probe namespace (/api/elixir/health, /api/elixir/echo):
      # temporary during the migration, behaves like the platform contract so
      # request-id pairing and envelope conformance are verifiable end-to-end
      # before any product endpoint is cut over. Removed at Phase 8.
      String.starts_with?(path, "/api/elixir/") ->
        true

      true ->
        Regex.match?(@service_route_re, path)
    end
  end

  defp finalize(conn) do
    conn =
      if conn.status >= 400 do
        normalize_error(conn)
      else
        conn
      end

    request_id = RequestID.current(conn) || RequestID.generate()
    put_resp_header(conn, RequestID.header(), request_id)
  end

  # Mirrors `_normalize_platform_error`: >= 500 becomes a generic internal
  # error; existing error envelopes keep their code/message but get the
  # authoritative request_id and redaction re-applied; anything else becomes
  # an error envelope for its status.
  defp normalize_error(conn) do
    request_id = RequestID.current(conn) || RequestID.generate()

    body =
      cond do
        conn.status >= 500 ->
          Radas.Envelope.error("INTERNAL_SERVER_ERROR", "Internal server error", request_id)

        is_error_envelope?(conn.resp_body) ->
          body = decode(conn.resp_body)

          body
          |> Map.put("request_id", request_id)
          |> Map.update!("error", &Radas.Redaction.redact_sensitive/1)

        true ->
          message = extract_message(conn.resp_body)
          Radas.Envelope.error(Radas.Envelope.error_code_for(conn.status), message, request_id)
      end

    %{conn | resp_body: Jason.encode!(body)}
  end

  defp is_error_envelope?(body) do
    case decode(body) do
      %{"error" => error} when is_map(error) -> true
      _ -> false
    end
  end

  defp extract_message(body) do
    case decode(body) do
      %{"message" => message} when is_binary(message) -> message
      _ -> "Request failed"
    end
  end

  defp decode(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> decoded
      _ -> nil
    end
  end

  defp decode(_), do: nil
end
