# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :radas,
  ecto_repos: [Radas.Repo],
  generators: [timestamp_type: :utc_datetime]

# The Python server owns `schema_migrations` (version INTEGER, applied_at REAL);
# Ecto tracks its own versions in a separate table to avoid a column clash.
# Schema versions 26-30 are mirrored into `schema_migrations` by the
# 20260904000001 migration so the Python runner skips them as applied.
config :radas, Radas.Repo,
  migration_source: "ecto_migrations"

# Configure the endpoint
config :radas, RadasWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: RadasWeb.ErrorJSON],
    layout: false
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
