defmodule RadasAI.SecretEncryption do
  @moduledoc """
  Port of `utils/secret_encryption.py` — AES-GCM secret encryption with full
  wire-format compatibility.

  Storage format (identical to Python):

  - v2:     base64( "v2" || salt(16) || nonce(12) || ciphertext+tag ), where
            the key is PBKDF2-HMAC-SHA256(server_key, salt, 200_000, 32 bytes).
  - Legacy: base64( nonce(12) || ciphertext+tag ) with the historical fixed
            salt — read-only compatibility so Python-encrypted secrets remain
            decryptable from Elixir on the shared PostgreSQL database.
  """

  @v2_prefix "v2"
  @legacy_fixed_salt "global_secrets_salt"
  @pbkdf2_iterations 200_000

  @spec server_key() :: binary() | nil
  def server_key do
    case System.get_env("GLOBAL_SECRETS_ENCRYPTION_KEY") do
      nil -> nil
      "" -> nil
      key -> key
    end
  end

  @doc "Encrypt with a fresh random 16-byte salt (v2 format). Empty in → empty out."
  @spec encrypt(String.t() | nil) :: String.t()
  def encrypt(plaintext) when plaintext in [nil, ""], do: ""

  def encrypt(plaintext) when is_binary(plaintext) do
    key = require_server_key()
    salt = :crypto.strong_rand_bytes(16)
    nonce = :crypto.strong_rand_bytes(12)
    derived = derive_key(key, salt)
    {cipher, tag} = :crypto.crypto_one_time_aead(:aes_256_gcm, derived, nonce, plaintext, "", 16, true)
    blob = @v2_prefix <> salt <> nonce <> cipher <> tag
    Base.encode64(blob)
  end

  @doc "Decrypt v2 or legacy Python-encrypted values. Empty in → empty out."
  @spec decrypt(String.t() | nil) :: String.t()
  def decrypt(encrypted) when encrypted in [nil, ""], do: ""

  def decrypt(encrypted) when is_binary(encrypted) do
    key = require_server_key()
    blob = Base.decode64!(encrypted)

    cond do
      blob_starts_with_v2?(blob) ->
        payload = binary_part(blob, byte_size(@v2_prefix), byte_size(blob) - byte_size(@v2_prefix))

        if byte_size(payload) < 16 + 12 + 16 do
          raise ArgumentError, message: "Encrypted data too short (v2)"
        end

        salt = binary_part(payload, 0, 16)
        nonce = binary_part(payload, 16, 12)
        cipher = binary_part(payload, 28, byte_size(payload) - 28)
        tag = binary_part(cipher, byte_size(cipher) - 16, 16)
        cipher = binary_part(cipher, 0, byte_size(cipher) - 16)
        derived = derive_key(key, salt)
        :crypto.crypto_one_time_aead(:aes_256_gcm, derived, nonce, cipher, "", tag, false)

      true ->
        if byte_size(blob) < 12 + 16 do
          raise ArgumentError, message: "Encrypted data too short (legacy)"
        end

        nonce = binary_part(blob, 0, 12)
        cipher = binary_part(blob, 12, byte_size(blob) - 12)
        tag = binary_part(cipher, byte_size(cipher) - 16, 16)
        cipher = binary_part(cipher, 0, byte_size(cipher) - 16)
        derived = derive_key(key, @legacy_fixed_salt)
        :crypto.crypto_one_time_aead(:aes_256_gcm, derived, nonce, cipher, "", tag, false)
    end
  end

  @doc "Decrypt returning {:ok, value} | {:error, reason} (non-raising helper)."
  def decrypt_safe(encrypted) do
    {:ok, decrypt(encrypted)}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp blob_starts_with_v2?(blob) do
    byte_size(blob) >= 2 and binary_part(blob, 0, 2) == @v2_prefix
  end

  defp derive_key(server_key, salt) do
    :crypto.pbkdf2_hmac(:sha256, server_key, salt, @pbkdf2_iterations, 32)
  end

  defp require_server_key do
    case server_key() do
      nil -> raise ArgumentError, message: "GLOBAL_SECRETS_ENCRYPTION_KEY is not set"
      key -> key
    end
  end
end
