defmodule RadasAI.ResponseStore do
  @moduledoc """
  Port of `services/ai_router/response_store.py`.

  Stateful Responses storage: the store=true / previous_response_id contract
  of the Responses API on top of stateless upstreams — conversations persisted
  per organization and replayed as context on follow-up calls.
  """

  import RadasAI.DB

  @max_context_depth 20

  @doc "Persist one response; returns the generated response id."
  @spec store_response(keyword()) :: String.t()
  def store_response(opts) do
    response_id = "resp-" <> (:crypto.strong_rand_bytes(12) |> Base.encode16(case: :lower))

    execute!(
      """
      INSERT INTO org_ai_responses
        (id, org_id, user_id, provider_name, model, input_messages, output_json, output_text, previous_response_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      """,
      [
        response_id,
        Keyword.fetch!(opts, :org_id),
        present_or(Keyword.get(opts, :user_id), "system"),
        Keyword.get(opts, :provider_name),
        Keyword.get(opts, :model),
        Jason.encode!(Keyword.get(opts, :input_messages, [])),
        encode_json(Keyword.get(opts, :output_json)),
        Keyword.get(opts, :output_text) || "",
        Keyword.get(opts, :previous_response_id),
        now()
      ]
    )

    response_id
  end

  @doc "Fetch one org-scoped response with decoded JSON columns."
  @spec get_response(String.t(), String.t()) :: map() | nil
  def get_response(org_id, response_id) do
    query_one!(
      "SELECT id, org_id, user_id, provider_name, model, input_messages, output_json, output_text, previous_response_id, created_at " <>
        "FROM org_ai_responses WHERE id = $1 AND org_id = $2",
      [response_id, org_id]
    )
  end

  @doc """
  Replay a stored response chain (oldest first) as chat-style messages.
  Depth-capped and cycle-safe.
  """
  @spec build_context_messages(String.t(), String.t()) :: [map()]
  def build_context_messages(org_id, previous_response_id) do
    walk(org_id, previous_response_id, [], MapSet.new())
  end

  defp walk(_org_id, nil, messages, _seen), do: messages

  defp walk(org_id, response_id, messages, seen) do
    cond do
      length(messages) >= @max_context_depth ->
        messages

      MapSet.member?(seen, response_id) ->
        messages

      true ->
        seen = MapSet.put(seen, response_id)

        case get_response(org_id, response_id) do
          nil ->
            messages

          row ->
            input_messages =
              case row["input_messages"] do
                list when is_list(list) -> Enum.filter(list, &is_map/1)
                binary when is_binary(binary) -> decode_list(binary)
                _ -> []
              end

            messages = messages ++ input_messages

            output_text = row["output_text"] || ""

            messages =
              if output_text != "",
                do: messages ++ [%{"role" => "assistant", "content" => output_text}],
                else: messages

            walk(org_id, row["previous_response_id"], messages, seen)
        end
    end
  end

  defp walk(_org_id, _response_id, messages, _seen), do: messages

  defp decode_list(binary) do
    case Jason.decode(binary) do
      {:ok, list} when is_list(list) -> list
      _ -> []
    end
  end

  defp encode_json(nil), do: nil
  defp encode_json(value), do: Jason.encode!(value)

  defp present_or(value, fallback) do
    if value in [nil, ""], do: fallback, else: value
  end
end
