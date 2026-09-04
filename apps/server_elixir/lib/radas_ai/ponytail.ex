defmodule RadasAI.Ponytail do
  @moduledoc """
  Port of `services/ai_router/ponytail.py`.

  Ponytail token-saver: a "lazy senior developer" persona block injected into
  the system message of the final request body. Prompts are adapted from the
  upstream MIT-licensed implementation (github.com/decolua/9router,
  open-sse/rtk/ponytailPrompt.js), which in turn adapts
  https://github.com/DietrichGebert/ponytail.
  """

  @levels ["lite", "full", "ultra"]

  @shared_persona "You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written."

  @shared_ladder "Before writing code, stop at the first rung that holds: 1) Does this need to exist at all? (YAGNI) 2) Stdlib does it? Use it. 3) Native platform feature covers it? Use it (CSS over JS, DB constraint over app code). 4) Already-installed dependency solves it? Use it; never add a new one for what a few lines can do. 5) Can it be one line? One line. 6) Only then: the minimum code that works."

  @shared_rules ~S{No unrequested abstractions (no interface with one implementation, no factory for one product, no config for a value that never changes). No boilerplate or scaffolding "for later". Deletion over addition. Boring over clever. Fewest files possible; shortest working diff wins. Two stdlib options the same size: take the edge-case-correct one. Mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path.}

  @shared_output ~S{Code first. Then at most three short lines: what was skipped, when to add it. No essays or design notes. Pattern: `[code] -> skipped: [X], add when [Y].`}

  @shared_not_lazy "Never simplify away: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind (an assert-based self-check or one small test file; no frameworks). Trivial one-liners need no test."

  @shared_persistence "ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure."

  @level_extras %{
    "lite" => ["Lite: build what's asked, but name the lazier alternative in one line. User picks."],
    "full" => ["Full: return the minimal working implementation, nothing speculative."],
    "ultra" => ["Ultra: the smallest possible diff that satisfies the request exactly. No comments beyond `ponytail:` markers."]
  }

  @doc "Assemble the Ponytail block for one intensity level."
  @spec ponytail_prompt(String.t()) :: String.t()
  def ponytail_prompt(level) when level in @levels do
    parts =
      [@shared_persona, hd(@level_extras[level]), @shared_ladder, @shared_rules, @shared_output, @shared_not_lazy, @shared_persistence]

    Enum.join(parts, "\n")
  end

  def ponytail_prompt(level) do
    raise ArgumentError, "unknown ponytail level #{inspect(level)}"
  end

  @doc """
  Inject the Ponytail block into the system message (creating one if absent).
  Accepts and returns string-keyed OpenAI message maps.
  """
  @spec apply_ponytail([map()], String.t()) :: [map()]
  def apply_ponytail(messages, level) when is_list(messages) do
    block = ponytail_prompt(level)
    messages = Enum.map(messages, &Map.new/1)

    system_index =
      Enum.find_index(messages, &(Map.get(&1, "role") == "system"))

    if system_index == nil do
      [%{"role" => "system", "content" => block} | messages]
    else
      List.update_at(messages, system_index, fn message ->
        Map.update!(message, "content", fn
          content when is_binary(content) ->
            String.trim(content <> "\n\n" <> block)

          parts when is_list(parts) ->
            text_parts = Enum.filter(parts, &(is_map(&1) and Map.get(&1, "type") == "text"))

            if text_parts == [] do
              [%{"type" => "text", "text" => block}]
            else
              idx = Enum.find_index(parts, &(&1 == List.last(text_parts)))

              List.update_at(parts, idx, fn part ->
                Map.put(part, "text", Map.get(part, "text") <> "\n\n" <> block)
              end)
            end
        end)
      end)
    end
  end
end
