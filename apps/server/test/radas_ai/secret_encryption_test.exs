defmodule RadasAI.SecretEncryptionTest do
  use ExUnit.Case, async: false

  # Key must match the Python fixture generation (see docs in the plan).
  @key "interop-test-key-1234567890"

  setup do
    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", @key)
    on_exit(fn -> System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY") end)
    :ok
  end

  test "decrypts a Python-encrypted v2 blob" do
    blob = "djJf1ylBZiWxuUZDPEH9+HgWuY2mzVNe4v9MCZ2WKxuyHqGwYMnS35Q5FxM5GcPgeCLzdCkExnqt1mCE8wYIzSD1xAQ9"
    assert RadasAI.SecretEncryption.decrypt(blob) == "sk-test-secret-value-42"
  end

  test "decrypts a Python-encrypted legacy blob (fixed salt)" do
    blob = "LgVW/Blb3N3fzde3WJCgF6UZY39yjpQKkygCcF4vDs2PLiIKhqjVjYxlJA=="
    assert RadasAI.SecretEncryption.decrypt(blob) == "legacy-value-77"
  end

  test "round-trips its own encryption" do
    plaintext = "another-secret-#{System.unique_integer()}"
    encrypted = RadasAI.SecretEncryption.encrypt(plaintext)
    assert encrypted != plaintext
    assert String.starts_with?(encrypted, Base.encode64("v2") |> binary_part(0, 2))
    assert RadasAI.SecretEncryption.decrypt(encrypted) == plaintext
  end

  test "empty values stay empty" do
    assert RadasAI.SecretEncryption.encrypt("") == ""
    assert RadasAI.SecretEncryption.decrypt("") == ""
  end

  test "missing key raises on encrypt/decrypt" do
    System.delete_env("GLOBAL_SECRETS_ENCRYPTION_KEY")

    assert_raise ArgumentError, ~r/not set/, fn ->
      RadasAI.SecretEncryption.encrypt("x")
    end

    System.put_env("GLOBAL_SECRETS_ENCRYPTION_KEY", @key)
  end
end
