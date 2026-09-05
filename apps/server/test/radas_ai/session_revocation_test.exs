defmodule RadasAI.SessionRevocationTest do
  use ExUnit.Case, async: false

  # Contract tests for the auth/service.py session-revocation port: the
  # file-based cutoff store shared with Flask through DATA_DIR, atomic
  # fail-closed persistence, and verify_token enforcement.
  alias RadasAI.AuthService
  alias RadasAI.AuthService.SessionRevocationError

  @jwt_secret "revocation-e2e-jwt-000000"

  setup do
    System.put_env("JWT_SECRET_KEY", @jwt_secret)
    data_dir = Path.join(System.tmp_dir!(), "radas-revocation-#{System.unique_integer()}")
    System.put_env("DATA_DIR", data_dir)

    on_exit(fn ->
      System.delete_env("JWT_SECRET_KEY")
      System.delete_env("DATA_DIR")
      File.rm_rf!(data_dir)
    end)

    {:ok, data_dir: data_dir}
  end

  defp mint_token(user_id, iat) do
    RadasAI.AuthToken.encode(
      %{
        "user_id" => user_id,
        "username" => user_id,
        "roles" => [],
        "token_type" => "access",
        "exp" => System.system_time(:second) + 600,
        "iat" => iat
      },
      @jwt_secret
    )
  end

  test "revoke_all_user_sessions writes an atomic cutoff and returns it", %{data_dir: data_dir} do
    cutoff = AuthService.revoke_all_user_sessions("user-r1", data_dir)

    assert is_integer(cutoff)
    # The file is valid JSON in the shared {user_id: cutoff} format.
    contents = File.read!(AuthService.session_revocations_path(data_dir))
    assert Jason.decode!(contents) == %{"user-r1" => cutoff}
  end

  test "are_user_sessions_revoked: iat <= cutoff is revoked, iat > cutoff is not", %{data_dir: data_dir} do
    cutoff = AuthService.revoke_all_user_sessions("user-r2", data_dir)

    assert AuthService.are_user_sessions_revoked("user-r2", cutoff, data_dir)
    assert AuthService.are_user_sessions_revoked("user-r2", cutoff - 10, data_dir)
    refute AuthService.are_user_sessions_revoked("user-r2", cutoff + 10, data_dir)
  end

  test "no cutoff or empty user id is never revoked", %{data_dir: data_dir} do
    refute AuthService.are_user_sessions_revoked("user-never", System.system_time(:second), data_dir)
    refute AuthService.are_user_sessions_revoked(nil, System.system_time(:second), data_dir)
    refute AuthService.are_user_sessions_revoked("", System.system_time(:second), data_dir)
  end

  test "verify_token rejects tokens issued before the cutoff and accepts newer ones", %{data_dir: data_dir} do
    now = System.system_time(:second)
    old_token = mint_token("user-r3", now - 100)
    new_token = mint_token("user-r3", now + 100)

    assert AuthService.verify_token(old_token, data_dir) != nil

    AuthService.revoke_all_user_sessions("user-r3", data_dir)

    assert AuthService.verify_token(old_token, data_dir) == nil
    assert AuthService.verify_token(new_token, data_dir) != nil
  end

  test "other users' tokens are unaffected by one user's revocation", %{data_dir: data_dir} do
    now = System.system_time(:second)
    other_token = mint_token("user-r4", now - 5)

    AuthService.revoke_all_user_sessions("user-r3", data_dir)

    assert AuthService.verify_token(other_token, data_dir) != nil
  end

  test "persistence failure fails closed with SessionRevocationError", %{data_dir: data_dir} do
    # Make the auth dir unwritable by creating a DIRECTORY where the target
    # file must be written (rename then fails).
    File.mkdir_p!(AuthService.session_revocations_path(data_dir))

    assert_raise SessionRevocationError, ~r/Failed to persist session revocation cutoff/, fn ->
      AuthService.revoke_all_user_sessions("user-r5", data_dir)
    end
  end

  test "malformed revocation file degrades to empty (no false revocations)", %{data_dir: data_dir} do
    path = AuthService.session_revocations_path(data_dir)
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, "not-json{")

    assert AuthService.load_user_session_revocations(data_dir) == %{}
    refute AuthService.are_user_sessions_revoked("user-r6", 1, data_dir)
  end

  test "string iat parses for the cutoff comparison", %{data_dir: data_dir} do
    cutoff = AuthService.revoke_all_user_sessions("user-r7", data_dir)
    assert AuthService.are_user_sessions_revoked("user-r7", Integer.to_string(cutoff), data_dir)
  end
end
