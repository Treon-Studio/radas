defmodule RadasAI.GatewayError do
  @moduledoc """
  Port of `services/ai_router/errors.py`.

  Raised for upstream gateway failures; `retryable` drives the ordered
  fallback chain (429 and 5xx are retryable, everything else is not).
  """

  defexception [:message, :status, :retryable]

  @type t :: %__MODULE__{message: String.t() | nil, status: integer() | nil, retryable: boolean()}

  def exception(opts) when is_list(opts) do
    %__MODULE__{
      message: Keyword.get(opts, :message, "upstream gateway error"),
      status: Keyword.get(opts, :status),
      retryable: Keyword.get(opts, :retryable, false)
    }
  end
end
