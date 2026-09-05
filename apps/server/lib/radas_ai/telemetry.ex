defmodule RadasAI.Telemetry do
  @moduledoc """
  Port of `services/ai_router/telemetry.py`.

  Request/attempt telemetry persistence. Log rows carry metadata only —
  request IDs, provider/model resolution, error classifications, token counts,
  and cost estimates. Prompts, completions, and credentials are never
  persisted; telemetry must never fail a request.
  """

  import RadasAI.DB

  alias RadasAI.Pricing

  @doc "Persist one redacted request log row (fail-open)."
  @spec record_request_log(keyword()) :: :ok
  def record_request_log(opts) do
    org_id = Keyword.fetch!(opts, :org_id)
    user_id = Keyword.get(opts, :user_id, "")
    endpoint = Keyword.fetch!(opts, :endpoint)
    requested_model = Keyword.fetch!(opts, :requested_model)
    attempts = Keyword.get(opts, :attempts, [])
    status = Keyword.fetch!(opts, :status)
    request_id = Keyword.fetch!(opts, :request_id)

    fallback_used =
      Enum.any?(attempts, &(is_map(&1) and Map.get(&1, "status") == "error"))

    cost =
      try do
        Pricing.estimate_cost(Keyword.get(opts, :resolved_model) || requested_model, Keyword.get(opts, :prompt_tokens, 0), Keyword.get(opts, :completion_tokens, 0))
      rescue
        _ -> 0.0
      end

    execute!(
      """
      INSERT INTO org_ai_request_logs
        (id, org_id, user_id, endpoint, requested_model, resolved_provider, resolved_model,
         status, error_code, http_status, latency_ms, prompt_tokens, completion_tokens,
         tokens_saved_rtk, cost_usd_est, fallback_used, stream, request_id, attempts, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      """,
      [
        "log-" <> uuid12(),
        org_id,
        present_or(user_id, "system"),
        endpoint,
        requested_model,
        Keyword.get(opts, :resolved_provider),
        Keyword.get(opts, :resolved_model),
        status,
        present_or(Keyword.get(opts, :error_code), nil),
        Keyword.get(opts, :http_status),
        max(0, Keyword.get(opts, :latency_ms, 0) |> trunc()),
        max(0, Keyword.get(opts, :prompt_tokens, 0)),
        max(0, Keyword.get(opts, :completion_tokens, 0)),
        max(0, Keyword.get(opts, :tokens_saved_rtk, 0)),
        cost,
        fallback_used,
        Keyword.get(opts, :stream, false),
        request_id,
        Jason.encode!(Enum.map(attempts, &Map.new/1)),
        Keyword.get(opts, :created_at) || now()
      ]
    )

    :ok
  rescue
    _ -> :ok
  end

  @doc "Redacted log rows for one organization, newest first."
  @spec list_request_logs(String.t(), keyword()) :: [map()]
  def list_request_logs(org_id, opts \\ []) do
    limit = clamp(Keyword.get(opts, :limit, 50), 1, 200)
    since = Keyword.get(opts, :since)
    until = Keyword.get(opts, :until)
    status = Keyword.get(opts, :status)

    {clauses, params} =
      build_filters([
        {"org_id = $", org_id},
        {"created_at >= $", since},
        {"created_at <= $", until},
        {"status = $", status}
      ])

    sql =
      "SELECT * FROM org_ai_request_logs WHERE #{clauses} ORDER BY created_at DESC LIMIT $" <>
        Integer.to_string(length(params) + 1)

    # psycopg auto-decodes JSONB; mirror that for the attempts column.
    Enum.map(query_all!(sql, params ++ [limit]), fn row ->
      case row["attempts"] do
        binary when is_binary(binary) ->
          case Jason.decode(binary) do
            {:ok, list} when is_list(list) -> Map.put(row, "attempts", list)
            _ -> row
          end

        _ ->
          row
      end
    end)
  end

  @doc "Aggregate cost/token/latency estimates over a date range (estimates only)."
  @spec cost_summary(String.t(), keyword()) :: map()
  def cost_summary(org_id, opts \\ []) do
    since = Keyword.get(opts, :since)
    until = Keyword.get(opts, :until)

    {clauses, params} =
      build_filters([
        {"org_id = $", org_id},
        {"status = 'success'", nil},
        {"created_at >= $", since},
        {"created_at <= $", until}
      ])

    rows =
      query_all!(
        """
        SELECT resolved_provider, resolved_model,
               COUNT(*) AS requests,
               SUM(prompt_tokens) AS prompt_tokens,
               SUM(completion_tokens) AS completion_tokens,
               SUM(tokens_saved_rtk) AS tokens_saved_rtk,
               SUM(cost_usd_est) AS cost_usd_est,
               AVG(latency_ms) AS avg_latency_ms,
               SUM(CASE WHEN fallback_used THEN 1 ELSE 0 END) AS fallbacks
        FROM org_ai_request_logs WHERE #{clauses}
        GROUP BY resolved_provider, resolved_model
        ORDER BY cost_usd_est DESC
        """,
        params
      )

    breakdown =
      Enum.map(rows, fn row ->
        %{
          "provider" => row["resolved_provider"] || "unknown",
          "model" => row["resolved_model"] || "unknown",
          "requests" => row["requests"] || 0,
          "prompt_tokens" => row["prompt_tokens"] || 0,
          "completion_tokens" => row["completion_tokens"] || 0,
          "tokens_saved_rtk" => row["tokens_saved_rtk"] || 0,
          "cost_usd_est" => round6(row["cost_usd_est"]),
          "avg_latency_ms" => round1(row["avg_latency_ms"]),
          "fallbacks" => row["fallbacks"] || 0
        }
      end)

    %{
      "total_requests" => sum_by(breakdown, "requests"),
      "total_prompt_tokens" => sum_by(breakdown, "prompt_tokens"),
      "total_completion_tokens" => sum_by(breakdown, "completion_tokens"),
      "total_tokens_saved_rtk" => sum_by(breakdown, "tokens_saved_rtk"),
      "total_fallbacks" => sum_by(breakdown, "fallbacks"),
      "total_cost_usd_est" => breakdown |> Enum.map(& &1["cost_usd_est"]) |> Enum.sum() |> round6(),
      "breakdown" => breakdown,
      "note" => "Costs are public-rate estimates for observability, not billing data."
    }
  end

  # -- helpers ---------------------------------------------------------------

  defp build_filters(entries) do
    entries
    |> Enum.reject(fn {_clause, value} -> is_nil(value) end)
    |> Enum.reduce({[], []}, fn
      {clause, value}, {cls, ps} = _acc ->
        if String.ends_with?(clause, "$") do
          {cls ++ ["(#{clause}#{length(ps) + 1})"], ps ++ [value]}
        else
          {cls ++ ["(#{clause})"], ps}
        end
    end)
    |> then(fn {cls, ps} -> {Enum.join(cls, " AND "), ps} end)
  end

  defp present_or(value, fallback) do
    if value in [nil, ""], do: fallback, else: value
  end

  defp clamp(value, min, max), do: value |> max(min) |> min(max)

  defp sum_by(breakdown, key), do: breakdown |> Enum.map(& &1[key]) |> Enum.sum()

  defp round6(nil), do: 0.0
  defp round6(value), do: Float.round(to_float(value), 6)

  defp round1(nil), do: 0.0
  defp round1(value), do: Float.round(to_float(value), 1)

  # PostgreSQL aggregates (AVG/SUM on DOUBLE PRECISION) arrive as Decimal.
  defp to_float(%Decimal{} = value), do: Decimal.to_float(value)
  defp to_float(value) when is_float(value), do: value
  defp to_float(value) when is_integer(value), do: value * 1.0
  defp to_float(value) when is_binary(value) do
    case Float.parse(value) do
      {f, _} -> f
      :error -> 0.0
    end
  end

  defp uuid12 do
    :crypto.strong_rand_bytes(6) |> Base.encode16(case: :lower)
  end
end
