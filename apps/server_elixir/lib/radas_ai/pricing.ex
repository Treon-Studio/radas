defmodule RadasAI.Pricing do
  @moduledoc """
  Port of `services/ai_router/pricing.py`.

  Per-model cost estimates from public provider rates (USD per 1M tokens).
  Estimates for observability only — never billing data. Unknown models cost
  0.0 so telemetry never fabricates spend.
  """

  # model substring -> {input_usd_per_1M, output_usd_per_1M}
  @prices [
    {"gpt-4o-mini", {0.15, 0.60}},
    {"gpt-4o", {2.50, 10.00}},
    {"o4-mini", {1.10, 4.40}},
    {"claude-3-5-sonnet", {3.00, 15.00}},
    {"claude-3-5-haiku", {0.80, 4.00}},
    {"claude-sonnet-4", {3.00, 15.00}},
    {"gemini-1.5-flash", {0.075, 0.30}},
    {"gemini-1.5-pro", {1.25, 5.00}},
    {"gemini-2.5-flash", {0.30, 2.50}},
    {"gemini-2.5-pro", {1.25, 10.00}},
    {"deepseek-chat", {0.14, 0.28}},
    {"deepseek-coder", {0.14, 0.28}},
    {"whisper", {0.0, 0.0}},
    {"tts", {0.0, 0.0}}
  ]

  @doc "Estimated USD cost for one response; 0.0 when pricing is unknown."
  @spec estimate_cost(String.t() | nil, integer(), integer()) :: float()
  def estimate_cost(model, prompt_tokens, completion_tokens) do
    value = String.downcase(model || "")

    Enum.find_value(@prices, 0.0, fn {marker, {input_price, output_price}} ->
      if String.contains?(value, marker) do
        round(prompt_tokens / 1_000_000 * input_price + completion_tokens / 1_000_000 * output_price, 6)
      end
    end)
  end

  defp round(value, places) do
    factor = :math.pow(10, places)
    Float.round(value * factor) / factor
  end
end
