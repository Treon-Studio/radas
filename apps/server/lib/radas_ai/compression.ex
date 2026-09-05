defmodule RadasAI.Compression do
  @moduledoc """
  Port of `services/ai_router/compression.py`.

  Token optimization primitives: RTK auto-detected filters per message, plus
  the Caveman concise-instruction suffix applied once, on the final message
  (mirroring upstream's end-of-conversation prompt injection).
  """

  alias RadasAI.RTK

  @doc """
  Apply RTK auto-detected filters per message; returns {messages, tokens_saved}.
  Non-string content passes through untouched.
  """
  @spec compress_messages([map()], keyword()) :: {[map()], integer()}
  def compress_messages(messages, opts \\ []) do
    enabled = Keyword.get(opts, :enabled, true)
    mode = Keyword.get(opts, :mode, "off")

    if not enabled do
      {Enum.map(messages, &Map.new/1), 0}
    else
      {result_rev, saved_rev} =
        Enum.reduce(messages, {[], 0}, fn message, {out, saved} ->
          value = Map.get(message, "content")

          if is_binary(value) do
            {new_value, _filter_name} = RTK.compress_text(value)
            new_saved = saved + div(max(0, String.length(value) - String.length(new_value)), 4)
            {[Map.put(message, "content", new_value) | out], new_saved}
          else
            {[message | out], saved}
          end
        end)

      result = Enum.reverse(result_rev)

      result =
        if mode in ["lite", "full", "ultra"] and result != [] do
          List.update_at(result, -1, fn last ->
            case Map.get(last, "content") do
              content when is_binary(content) -> Map.put(last, "content", caveman(content, mode))
              _ -> last
            end
          end)
        else
          result
        end

      {result, saved_rev}
    end
  end

  @doc "Apply the upstream-compatible concise instruction modifier."
  @spec caveman(String.t(), String.t()) :: String.t()
  def caveman(text, mode) do
    if String.trim(text) == "" do
      text
    else
      suffix =
        case mode do
          "lite" -> "\n[Respond concisely; preserve essential details.]"
          "full" -> "\n[Be concise. Prefer actionable steps and compact code.]"
          "ultra" -> "\n[ULTRA CONCISE: return only the answer and required code.]"
        end

      text <> suffix
    end
  end
end
