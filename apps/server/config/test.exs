import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :radas, Radas.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "radas_test#{System.get_env("MIX_TEST_PARTITION")}",
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
