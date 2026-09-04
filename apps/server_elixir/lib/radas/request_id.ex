defmodule Radas.RequestID do
  @moduledoc """
  Port of `api/platform_contracts.py` request-ID helpers.

  The authoritative request ID is resolved once per request (from the client
  `X-Request-ID` header when valid, otherwise generated), stored in
  `conn.private`, and reused by every envelope and the response finalizer so
  the body `request_id` always equals the `X-Request-ID` header.
  """

  @header "x-request-id"
  @valid_re ~r/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

  @doc "Return a fresh opaque request identifier (UUID v4, like `str(uuid4())`)."
  def generate do
    Ecto.UUID.generate()
  end

  @doc "Whether `value` is a syntactically valid request ID."
  def valid?(value) when is_binary(value) do
    Regex.match?(@valid_re, value)
  end

  def valid?(_), do: false

  @doc """
  Sanitize a client-supplied request ID; returns the trimmed value when it is
  usable, otherwise `nil` (mirrors `_valid_request_id`).
  """
  def sanitize(value) when is_binary(value) do
    value = String.trim(value)
    if valid?(value), do: value, else: nil
  end

  def sanitize(_), do: nil

  @doc "Header name used for correlation."
  def header, do: @header

  @doc """
  Extract a safe client request ID from request headers, or `nil` when it is
  unusable. Checks `X-Request-ID` then `Request-Id`.
  """
  def extract(headers) when is_map(headers) do
    sanitize(Map.get(headers, "x-request-id") || Map.get(headers, "request-id"))
  end

  def extract(_), do: nil

  @doc "Read the authoritative request ID for a connection, or `nil` when unset."
  def current(conn) do
    Map.get(conn.private, :platform_request_id)
  end

  @doc """
  Resolve (or override) the authoritative request ID for `conn`.

  An explicit non-nil value is authoritative for the rest of the request,
  mirroring Python `_set_request_id`.
  """
  def put(%Plug.Conn{} = conn, nil) do
    existing = current(conn) || extract(conn.req_headers |> Map.new())
    request_id = existing || generate()
    Plug.Conn.put_private(conn, :platform_request_id, request_id)
  end

  def put(%Plug.Conn{} = conn, value) do
    case sanitize(value) do
      nil -> put(conn, nil)
      safe -> Plug.Conn.put_private(conn, :platform_request_id, safe)
    end
  end

  @doc "Resolve without a connection (outside a request), mirroring the non-request path."
  def resolve(nil), do: generate()

  def resolve(value) do
    sanitize(value) || generate()
  end
end
