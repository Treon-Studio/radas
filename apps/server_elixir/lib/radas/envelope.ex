defmodule Radas.Envelope do
  @moduledoc """
  Port of `api/platform_contracts.py` response constructors.

  These are pure functions: the authoritative `request_id` is resolved by
  `RadasWeb.Plugs.PlatformContract` (stored in `conn.private`) and passed in
  by controllers, mirroring Python's `_set_request_id(request_id_value)`.

  Contract policy (mirrors the Python source and the served `/api/v2`
  document):

  - `error.details` must never carry credential material — sensitive keys and
    inline secret values are replaced with `[REDACTED]`.
  - Internal exception text must never reach `message` or `details`.
  - Retryability may appear only as the boolean `details.retryable` or the
    category token `details.retry_category` — never as free text.
  """

  alias Radas.Redaction
  alias Radas.RequestID

  @error_codes %{
    400 => "BAD_REQUEST",
    401 => "UNAUTHORIZED",
    403 => "FORBIDDEN",
    404 => "NOT_FOUND",
    405 => "METHOD_NOT_ALLOWED",
    409 => "CONFLICT",
    422 => "VALIDATION_ERROR",
    429 => "RATE_LIMITED",
    500 => "INTERNAL_SERVER_ERROR"
  }

  @retryable_error_codes MapSet.new(["RATE_LIMITED"])

  @doc "Error codes a client may retry without client-side changes."
  def retryable_error_codes, do: MapSet.to_list(@retryable_error_codes)

  @doc "Whether an error `code` is classified as safe to retry."
  def retryable?(code) when is_binary(code), do: MapSet.member?(@retryable_error_codes, code)

  @doc "Map an HTTP status to its canonical platform error-code string."
  def error_code_for(status) when is_integer(status) do
    Map.get(@error_codes, status, "HTTP_#{status}")
  end

  @doc "Build the standard successful API body without exposing credentials."
  def success(data, request_id) do
    %{"data" => Redaction.redact_sensitive(data), "request_id" => request_id}
  end

  @doc """
  Build a safe standard error body with a redacted message and details.
  """
  def error(code, message, details, request_id) do
    %{
      "error" => %{
        "code" => code,
        "message" => Redaction.redact_sensitive(to_string(message)),
        "details" => Redaction.redact_sensitive(details || %{})
      },
      "request_id" => request_id
    }
  end

  def error(code, message, request_id) when is_binary(request_id) do
    error(code, message, %{}, request_id)
  end

  @doc """
  Build the standard asynchronous operation body.

  Requires `id`, `kind`, `status`, `poll_url` — raises `ArgumentError` when a
  field is missing (mirrors Python `ValueError`). Keeps the
  `data.operation` compatibility alias for older console clients.
  """
  def operation(operation, request_id) when is_map(operation) do
    required = ["id", "kind", "status", "poll_url"]
    missing = Enum.filter(required, &(not Map.has_key?(operation, &1)))

    if missing != [] do
      raise ArgumentError, "operation is missing required fields: #{Enum.join(missing, ", ")}"
    end

    safe_operation = Redaction.redact_sensitive(operation)

    %{
      "operation" => safe_operation,
      "data" => %{"operation" => safe_operation},
      "request_id" => request_id
    }
  end

  @doc "Resolve a request ID when no connection is available (out-of-request helpers)."
  def request_id(nil), do: RequestID.generate()

  def request_id(value), do: RequestID.resolve(value)
end
