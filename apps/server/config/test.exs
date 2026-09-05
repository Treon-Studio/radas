import Config

# The database URL comes from the environment (TEST_DATABASE_URL / DATABASE_URL)
# so CI and local runs share one code path; the fallback matches the Phoenix
# generator default for bare `mix test` without env setup.
config :radas, Radas.Repo,
  url:
    System.get_env("TEST_DATABASE_URL") || System.get_env("DATABASE_URL") ||
      "ecto://postgres:postgres@localhost/radas_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :radas, RadasWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "2SnhrvuXCCJ3470gv7icxOZr83SC+Sni68GzsweQb2cVz5Nu4sYKqZZehL7BXPjn",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true

# Chat pipeline: synthesize completions when a provider has no credentials
# (mirrors the Python FLASK_ENV=testing branch). Tests never call paid APIs.
config :radas, gateway_testing: true
