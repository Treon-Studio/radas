defmodule RadasAI.Pxpipe do
  @moduledoc """
  Port of `services/ai_router/pxpipe.py`.

  Pxpipe token-saver: render bulky Claude-format request bodies as dense PNGs
  via an external pxpipe-proxy service. Fail-open like every token saver —
  any error, timeout, disabled state, or under-threshold payload returns
  {nil, skip_summary} so the caller sends the original body untouched.
  """

  @default_timeout_ms 15_000
  @default_min_chars 25_000
  @est_chars_per_token 4

  @doc """
  Transform one Claude-format request body via the pxpipe service.

  Returns {"body": new_body | nil, "summary": map} — body is nil when nothing
  changed (skipped, failed, or unprofitable).
  """
  @spec compress_with_pxpipe(map(), keyword()) :: %{String.t() => map() | nil}
  def compress_with_pxpipe(body, opts \\ []) do
    enabled = Keyword.get(opts, :enabled, true)
    pxpipe_url = Keyword.get(opts, :pxpipe_url, "") || System.get_env("PXPIPE_URL", "")
    model = Keyword.get(opts, :model, "")
    min_chars = Keyword.get(opts, :min_chars, @default_min_chars)
    timeout_ms = Keyword.get(opts, :timeout_ms, @default_timeout_ms)

    cond do
      not enabled ->
        %{"body" => nil, "summary" => skipped("disabled")}

      true ->
        url = String.trim(to_string(pxpipe_url))

        if url == "" do
          %{"body" => nil, "summary" => skipped("pxpipe_not_configured")}
        else
          url = String.trim_trailing(url, "/")
          chars = String.length(Jason.encode!(body))

          if chars < min_chars do
            %{"body" => nil,
              "summary" => skipped("below_min_chars", %{"chars" => chars, "min_chars" => min_chars})}
          else
            call_pxpipe(url, body, model, timeout_ms, chars)
          end
        end
    end
  end

  defp call_pxpipe(url, body, model, timeout_ms, chars) do
    payload = %{"body" => body, "model" => model}

    result =
      Req.post(url <> "/transformAnthropicMessages",
        json: payload,
        receive_timeout: timeout_ms,
        retry: false
      )

    case result do
      {:ok, %Req.Response{status: status, body: resp_body}} when status in 200..299 ->
        case resp_body do
          %{"body" => new_body} when is_map(new_body) ->
            after_chars = String.length(Jason.encode!(new_body))

            if after_chars >= chars do
              %{"body" => nil,
               "summary" => skipped("not_profitable", %{"chars" => chars, "after" => after_chars})}
            else
              %{"body" => new_body,
               "summary" => %{
                 "applied" => true,
                 "chars_before" => chars,
                 "chars_after" => after_chars,
                 "est_tokens_before" => est_tokens(chars),
                 "est_tokens_after" => est_tokens(after_chars),
                 "estimated" => true
               }}
            end

          _ ->
            %{"body" => nil, "summary" => skipped("pxpipe_invalid_response")}
        end

      {:ok, %Req.Response{status: status}} ->
        %{"body" => nil,
         "summary" => skipped("pxpipe_error", %{"detail" => "HTTP #{status}" |> String.slice(0, 200)})}

      {:error, exception} ->
        detail = (Map.get(exception, :message) || inspect(exception)) |> String.slice(0, 200)
        %{"body" => nil, "summary" => skipped("pxpipe_error", %{"detail" => detail})}
    end
  rescue
    e -> %{"body" => nil, "summary" => skipped("pxpipe_error", %{"detail" => (Exception.message(e) || "") |> String.slice(0, 200)})}
  end

  defp skipped(reason, extra \\ %{}),
    do: Map.merge(%{"applied" => false, "reason" => reason}, extra)

  defp est_tokens(chars), do: round(chars / @est_chars_per_token)
end
