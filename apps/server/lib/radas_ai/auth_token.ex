defmodule RadasAI.AuthToken do
  @moduledoc """
  Python-compatible JWT (HS256) verification for the shared auth domain.

  Mirrors `auth/service.py::generate_token` / `verify_token`: claims are
  `user_id`, `username`, `roles`, `token_type`, `exp`, `iat`, optional
  `org_id` + extra claims. Signature is HMAC-SHA256 over
  `base64url(header).base64url(payload)` with `JWT_SECRET_KEY`. Tokens minted
  by the Flask server verify here unchanged, and vice versa.

  Token-blacklist checks (file-based in Python) and session revocations land
  with Phase 2 (auth migration); this module carries the crypto contract.
  """

  @header %{"alg" => "HS256", "typ" => "JWT"}

  @doc "Sign claims exactly like Python's generate_token."
  @spec encode(map(), String.t()) :: String.t()
  def encode(claims, secret) do
    header = b64url(Jason.encode!(@header))
    payload = b64url(Jason.encode!(claims))
    signing_input = header <> "." <> payload
    signature = :crypto.mac(:hmac, :sha256, secret, signing_input)
    signing_input <> "." <> b64url(signature)
  end

  @doc """
  Verify signature + expiry (+ token_type when given).

  Returns `{:ok, claims}` or `:error`. Mirrors PyJWT's HS256 decode with exp
  verification; `token_type` mismatch returns :error like Python's None.
  """
  @spec verify(String.t(), String.t(), keyword()) :: {:ok, map()} | :error
  def verify(token, secret, opts \\ []) when is_binary(token) and is_binary(secret) do
    with [header_b64, payload_b64, signature_b64] <- String.split(token, ".", parts: 3),
         {:ok, claims} <- decode_and_check_sig(header_b64, payload_b64, signature_b64, secret),
         :ok <- check_exp(claims),
         :ok <- check_token_type(claims, Keyword.get(opts, :token_type)) do
      {:ok, claims}
    else
      _ -> :error
    end
  end

  defp decode_and_check_sig(header_b64, payload_b64, signature_b64, secret) do
    with {:ok, header} <- decode_segment(header_b64),
         true <- is_map(header) and Map.get(header, "alg") == "HS256",
         {:ok, payload} <- decode_segment(payload_b64),
         true <- is_map(payload),
         expected = :crypto.mac(:hmac, :sha256, secret, header_b64 <> "." <> payload_b64),
         {:ok, signature} <- Base.url_decode64(signature_b64, padding: false),
         true <- :crypto.hash_equals(expected, signature) do
      {:ok, payload}
    else
      _ -> :error
    end
  end

  defp check_exp(%{"exp" => exp}) when is_integer(exp) or is_float(exp) do
    if System.system_time(:second) <= trunc(exp), do: :ok, else: :error
  end

  # No exp claim: PyJWT rejects by default; we accept (parity with tokens
  # minted without exp) but this never happens for RADAS tokens.
  defp check_exp(_), do: :ok

  defp check_token_type(%{"token_type" => token_type}, expected) when is_binary(expected) do
    if token_type == expected, do: :ok, else: :error
  end

  defp check_token_type(_claims, nil), do: :ok

  defp decode_segment(segment) do
    with {:ok, json} <- Base.url_decode64(segment, padding: false),
         {:ok, decoded} <- Jason.decode(json) do
      {:ok, decoded}
    else
      _ -> :error
    end
  end

  defp b64url(data) when is_binary(data), do: Base.url_encode64(data, padding: false)
end
