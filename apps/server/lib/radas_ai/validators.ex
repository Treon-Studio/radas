defmodule RadasAI.Validators do
  @moduledoc "Port of `auth/validators.py` (PCI-DSS aligned password policy)."

  @spec validate_username(String.t() | nil) :: :ok | {:error, String.t()}
  def validate_username(username) when is_binary(username) do
    trimmed = String.trim(username)

    cond do
      trimmed == "" ->
        {:error, "Username is required"}

      String.length(trimmed) < 3 ->
        {:error, "Username must contain at least 3 characters"}

      String.length(trimmed) > 50 ->
        {:error, "Username must not exceed 50 characters"}

      not Regex.match?(~r/^[a-zA-Z0-9_-]+$/, trimmed) ->
        {:error, "Username can only contain letters, numbers, underscores and hyphens"}

      true ->
        :ok
    end
  end

  def validate_username(nil), do: {:error, "Username is required"}
  def validate_username(_), do: {:error, "Username must be a string"}

  @spec validate_password(String.t() | nil) :: :ok | {:error, String.t()}
  def validate_password(password) when is_binary(password) do
    cond do
      password == "" ->
        {:error, "Password is required"}

      String.length(password) < 12 ->
        {:error, "Password must contain at least 12 characters"}

      String.length(password) > 128 ->
        {:error, "Password must not exceed 128 characters"}

      classes(password) < 3 ->
        {:error,
         "Password must include at least three of: uppercase, lowercase, digit, special character"}

      true ->
        :ok
    end
  end

  def validate_password(nil), do: {:error, "Password is required"}
  def validate_password(_), do: {:error, "Password must be a string"}

  @spec validate_email(String.t() | nil) :: :ok | {:error, String.t()}
  def validate_email(nil), do: :ok
  def validate_email(""), do: :ok

  def validate_email(email) when is_binary(email) do
    if Regex.match?(~r/^[^@\s]+@[^@\s]+\.[^@\s]+$/, email), do: :ok, else: {:error, "Invalid email address"}
  end

  def validate_email(_), do: {:error, "Email must be a string"}

  defp classes(password) do
    [
      Regex.match?(~r/[a-z]/, password),
      Regex.match?(~r/[A-Z]/, password),
      Regex.match?(~r/\d/, password),
      Regex.match?(~r/[^A-Za-z0-9]/, password)
    ]
    |> Enum.count(& &1)
  end
end
