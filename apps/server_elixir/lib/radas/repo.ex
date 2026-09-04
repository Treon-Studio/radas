defmodule Radas.Repo do
  use Ecto.Repo,
    otp_app: :radas,
    adapter: Ecto.Adapters.Postgres
end
