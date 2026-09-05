defmodule Radas.Redaction do
  @moduledoc """
  Port of `api/platform_contracts.py::redact_sensitive`.

  Security contract: copies `value` while removing credential-like fields and
  values. Sensitive keys and inline secret values are replaced with
  `[REDACTED]`; short-lived capability tokens and `secret_ref` references are
  allowlisted because callers need them to complete explicit flows.
  """

  @capability_tokens MapSet.new([
                       "confirmation_token",
                       "production_confirmation_token",
                       "impact_token"
                     ])

  # _SENSITIVE_NAME + _SENSITIVE_KEY_RE (Python re.match semantics == anchored
  # pattern; `^...$` gives the same result via Regex.match?/2).
  @sensitive_key_re ~r/^(?:.*[_\-.])?(?:pass(?:word|wd|phrase)?|secret|token|api[_-]?key|authorization|credential|access[_-]?token|refresh[_-]?token|client[_-]?secret|aws[_-]?(?:secret[_-]?access[_-]?key|session[_-]?token)|private[_-]?key)(?:[_\-.].*)?$/i

  @private_key_re ~r/-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----/is

  @bearer_re ~r/\bBearer\s+[A-Za-z0-9._~+\/=-]+/i

  @secret_reference_re ~r{\A(?:secret://|ref:)[A-Za-z0-9][A-Za-z0-9._:/-]*\z}

  # _SENSITIVE_INLINE_NAME allows dotted namespace prefixes/suffixes, e.g.
  # "oauth.client_secret.value=raw".
  @sensitive_quoted_value_re ~r{(?i)(?<prefix>["']?(?:[\w-]+\.)*(?:pass(?:word|wd|phrase)?|secret|token|api[_-]?key|authorization|credential|access[_-]?token|refresh[_-]?token|client[_-]?secret|aws[_-]?(?:secret[_-]?access[_-]?key|session[_-]?token)|private[_-]?key)(?:\.[\w-]+)*["']?\s*(?:=|:)\s*)(?<quote>["'])(?<value>.*?)\k<quote>}

  # Authorization-style header values are credential material in full (scheme
  # plus credentials), so the whole remainder of the value is redacted.
  @sensitive_credential_header_re ~r{(?i)(?<prefix>["']?(?:proxy[-_])?authorization["']?\s*(?:=|:)\s*)(?<value>[^"',;\}\r\n]*)}

  @sensitive_unquoted_value_re ~r{(?i)(?<prefix>["']?(?:[\w-]+\.)*(?:pass(?:word|wd|phrase)?|secret|token|api[_-]?key|authorization|credential|access[_-]?token|refresh[_-]?token|client[_-]?secret|aws[_-]?(?:secret[_-]?access[_-]?key|session[_-]?token)|private[_-]?key)(?:\.[\w-]+)*["']?\s*(?:=|:)\s*)(?<value>[^\s,;\}]+)}

  @doc """
  Copy `value` while removing credential-like fields and values.

  Works on JSON-shaped data (string-keyed maps, lists, strings, scalars).
  """
  def redact_sensitive(%{} = value) do
    Map.new(value, fn {key, item} ->
      key_text = to_string(key)

      cond do
        MapSet.member?(@capability_tokens, key_text) and is_binary(item) ->
          {key, item}

        secret_ref_map?(item) ->
          {key, %{"secret_ref" => item["secret_ref"]}}

        key_text == "secret_ref" and is_binary(item) and Regex.match?(@secret_reference_re, item) ->
          {key, item}

        true ->
          if Regex.match?(@sensitive_key_re, key_text) do
            {key, "[REDACTED]"}
          else
            {key, redact_sensitive(item)}
          end
      end
    end)
  end

  def redact_sensitive(value) when is_list(value) do
    Enum.map(value, &redact_sensitive/1)
  end

  def redact_sensitive(value) when is_tuple(value) do
    value
    |> Tuple.to_list()
    |> Enum.map(&redact_sensitive/1)
    |> List.to_tuple()
  end

  def redact_sensitive(value) when is_binary(value) do
    value = Regex.replace(@private_key_re, value, "[REDACTED]")
    value = Regex.replace(@bearer_re, value, "Bearer [REDACTED]")

    value =
      Regex.replace(@sensitive_quoted_value_re, value, fn match, _caps ->
        caps = Regex.named_captures(@sensitive_quoted_value_re, match)
        "#{caps["prefix"]}#{caps["quote"]}[REDACTED]#{caps["quote"]}"
      end)

    value =
      Regex.replace(@sensitive_credential_header_re, value, fn match, _caps ->
        "#{Regex.named_captures(@sensitive_credential_header_re, match)["prefix"]}[REDACTED]"
      end)

    Regex.replace(@sensitive_unquoted_value_re, value, fn match, _caps ->
      "#{Regex.named_captures(@sensitive_unquoted_value_re, match)["prefix"]}[REDACTED]"
    end)
  end

  def redact_sensitive(value), do: value

  @doc "Short alias matching the Python-side common term."
  def redact(value), do: redact_sensitive(value)

  defp secret_ref_map?(%{} = item) do
    keys = Map.new(item, fn {k, v} -> {to_string(k), v} end)

    MapSet.equal?(MapSet.new(Map.keys(keys)), MapSet.new(["secret_ref"])) and
      is_binary(keys["secret_ref"]) and
      Regex.match?(@secret_reference_re, keys["secret_ref"])
  end

  defp secret_ref_map?(_), do: false

  @doc "Whether `key` is a sensitive field name (exposed for tests)."
  def sensitive_key?(key) when is_binary(key) do
    Regex.match?(@sensitive_key_re, key)
  end
end
