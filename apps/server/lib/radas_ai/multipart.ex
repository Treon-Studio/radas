defmodule RadasAI.Multipart do
  @moduledoc """
  Minimal multipart/form-data encoder, ported from `_multipart_body` in
  `services/ai_router/gateway.py` (stdlib-only in Python; here stdlib-only in
  Elixir so the wire format is byte-comparable).
  """

  @spec encode(map(), String.t(), String.t(), binary(), String.t()) :: {binary(), String.t()}
  def encode(fields, file_field, filename, content, file_content_type) do
    boundary = "----radas9router" <> (:crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower))

    field_parts =
      fields
      |> Enum.map(fn {name, value} ->
        "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{name}\"\r\n\r\n#{value}\r\n"
      end)

    file_part =
      "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{file_field}\"; filename=\"#{filename}\"\r\n" <>
        "Content-Type: #{file_content_type}\r\n\r\n" <> content <> "\r\n"

    terminator = "--#{boundary}--\r\n"

    body =
      (field_parts ++ [file_part, terminator])
      |> Enum.map(&String.to_charlist/1)
      |> :erlang.iolist_to_binary()

    {body, "multipart/form-data; boundary=#{boundary}"}
  end
end
