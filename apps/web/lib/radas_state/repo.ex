defmodule RadasState.Repo do
  use Ecto.Repo,
    otp_app: :radas_state,
    adapter: Ecto.Adapters.Postgres
end
