defmodule RadasWeb.Router do
  use RadasWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  # /api/v2/cloud/stacks — JWT auth like Python's @require_project_access
  # (project/org membership is checked per-request in the controller).
  pipeline :v2_auth do
    plug :accepts, ["json"]
    plug RadasWeb.Plugs.Auth
  end

  # /api/v1 — 9Router gateway surface (endpoint key or JWT auth).
  pipeline :gateway do
    plug :accepts, ["json"]
    plug RadasWeb.Plugs.GatewayAuth
  end

  # /api/orgs/:org_id/ai — management surface (JWT + org access, mutations
  # require owner/admin; enforced per-action inside the controller).
  pipeline :ai_management do
    plug :accepts, ["json"]
    plug RadasWeb.Plugs.GatewayAuth
  end

  scope "/api", RadasWeb do
    pipe_through :api

    get "/elixir/health", HealthController, :show
    post "/elixir/echo", EchoController, :create

    # Legacy auth namespace (Phase 2): flat {success, ...} bodies, public.
    post "/auth/login", AuthController, :login
    post "/auth/refresh", AuthController, :refresh
    post "/auth/logout", AuthController, :logout

    # Public evaluate — the Go worker calls this with its registry token and
    # Python ships it without @require_auth (worker/console contract).
    post "/flags/evaluate", FlagsController, :evaluate

    # Cloud stacks (Phase 7): stack CRUD + state routes over the shared
    # DATA_DIR layout and stack_meta jsonb (coexistence with Flask).
    # Python guards these with @require_project_access — JWT + org
    # membership on the resolved project (enforced in the controller).
    scope "/v2/cloud/stacks" do
      pipe_through :v2_auth

      # Literal single-segment paths must precede "/:name".
      get "/archived", CloudStacksController, :archived_list
      get "/runs", CloudStacksController, :all_runs
      get "/ttl/expired", CloudStacksController, :ttl_expired
      post "/bulk-tags", CloudStacksController, :bulk_tags

      get "/", CloudStacksController, :list
      post "/", CloudStacksController, :create
      get "/:name", CloudStacksController, :show
      put "/:name", CloudStacksController, :update
      delete "/:name", CloudStacksController, :delete
      post "/:name/actions", CloudStacksController, :stack_action
      get "/:name/state/overview", CloudStacksController, :state_overview
      get "/:name/state/lock", CloudStacksController, :state_lock_get
      post "/:name/state/lock", CloudStacksController, :state_lock_acquire
      delete "/:name/state/lock", CloudStacksController, :state_lock_release
      get "/:name/state/versions", CloudStacksController, :state_versions_list
      post "/:name/state/versions", CloudStacksController, :state_versions_snapshot
      get "/:name/state/versions/:version_id", CloudStacksController, :state_version_get
      post "/:name/state/versions/:version_id/rollback", CloudStacksController, :state_version_rollback
      get "/:name/state/audit", CloudStacksController, :state_audit
      get "/:name/state/backend", CloudStacksController, :state_backend_get
      put "/:name/state/backend", CloudStacksController, :state_backend_put
      get "/:name/drift", CloudStacksController, :drift_get
      put "/:name/drift", CloudStacksController, :drift_set
      get "/:name/runs", CloudStacksController, :runs_list
      get "/:name/runs/:run_id", CloudStacksController, :run_get
      get "/:name/runs/:run_id/stream", CloudStacksController, :run_stream
      get "/:name/state", CloudStacksController, :state_inspect
      post "/:name/force-unlock", CloudStacksController, :force_unlock
      get "/:name/inventory", CloudStacksController, :inventory
      get "/:name/protection", CloudStacksController, :protection_get
      post "/:name/protection", CloudStacksController, :protection_set
      put "/:name/protection", CloudStacksController, :protection_set
      get "/:name/dependencies", CloudStacksController, :dependencies_get
      post "/:name/dependencies", CloudStacksController, :dependencies_set
      put "/:name/dependencies", CloudStacksController, :dependencies_set
      get "/:name/ttl", CloudStacksController, :ttl_get
      post "/:name/ttl", CloudStacksController, :ttl_set
      put "/:name/ttl", CloudStacksController, :ttl_set
      get "/:name/circuit-breaker", CloudStacksController, :circuit_breaker_get
      post "/:name/circuit-breaker/reset", CloudStacksController, :circuit_breaker_reset
      get "/:name/config/export", CloudStacksController, :config_export
      post "/:name/config/import", CloudStacksController, :config_import
      get "/:name/timeout", CloudStacksController, :timeout_get
      post "/:name/timeout", CloudStacksController, :timeout_set
      put "/:name/timeout", CloudStacksController, :timeout_set
      get "/:name/cooldown", CloudStacksController, :cooldown_get
      get "/:name/pin", CloudStacksController, :pin_get
      post "/:name/pin", CloudStacksController, :pin_set
      put "/:name/pin", CloudStacksController, :pin_set
      post "/:name/archive", CloudStacksController, :archive
      post "/:name/restore", CloudStacksController, :restore
    end

    # Provider catalog + wizard schemas (Python list_providers / *_schema).
    scope "/v2/cloud" do
      pipe_through :v2_auth

      get "/providers", CloudStacksController, :providers_list
      get "/bytedc/schema", CloudStacksController, :bytedc_schema
      get "/:provider/schema", CloudStacksController, :provider_schema
      get "/dependencies/graph", CloudStacksController, :dependency_graph
      post "/scan-plan", CloudStacksController, :scan_plan
      get "/executions/:execution_id/comments", CloudStacksController, :comments_list
      post "/executions/:execution_id/comments", CloudStacksController, :comments_add
    end

    # SSO (env-gated; 503 when the provider is not configured).
    get "/auth/google/begin", AuthController, :google_begin
    get "/auth/google/callback", AuthController, :google_callback
    get "/auth/github/begin", AuthController, :github_begin
    get "/auth/github/callback", AuthController, :github_callback
  end

  # Legacy authenticated namespace (JWT / internal-call; readonly enforced).
  pipeline :legacy_auth do
    plug :accepts, ["json"]
    plug RadasWeb.Plugs.Auth
  end

  scope "/api/executions", RadasWeb do
    pipe_through :legacy_auth

    get "/", ExecutionsController, :list
    post "/", ExecutionsController, :create
    post "/clear", ExecutionsController, :clear
    get "/stats", ExecutionsController, :stats
    get "/:execution_id", ExecutionsController, :show
    patch "/:execution_id", ExecutionsController, :update
    get "/:execution_id/logs", ExecutionsController, :logs_parsed
    post "/:execution_id/logs", ExecutionsController, :logs_append
    get "/:execution_id/log", ExecutionsController, :log_incremental
    get "/:execution_id/log/stream", ExecutionsController, :log_stream
  end

  # Project-scoped execution actions (cancel/stop).
  scope "/api/projects/:project_id/executions", RadasWeb do
    pipe_through :legacy_auth

    post "/:execution_id/cancel", ExecutionsController, :cancel
    post "/:execution_id/stop", ExecutionsController, :stop
  end

  # Execution settings (GET is intentionally unauthenticated — public UI
  # bootstrap, mirroring Python).
  get "/api/execution_settings", RadasWeb.ExecutionsController, :settings_show
  post "/api/execution_settings", RadasWeb.ExecutionsController, :settings_save

  get "/api/executions/stream", RadasWeb.ExecutionsController, :execution_stream

  # Feature flags (Phase 5): all routes authenticate (JWT / internal-call /
  # worker token — the Go worker sends its registry token); mutations are
  # admin-gated inside the controller. Evaluate works for both console users
  # and workers.
  scope "/api/flags", RadasWeb do
    pipe_through :legacy_auth

    get "/", FlagsController, :list
    post "/", FlagsController, :create
    patch "/:key", FlagsController, :update
    delete "/:key", FlagsController, :delete
    get "/audit", FlagsController, :audit
    post "/expire-due", FlagsController, :expire_due
    get "/export", FlagsController, :export
    post "/import", FlagsController, :import
  end

  # Public evaluate — the Go worker calls this with its registry token and
  # Python ships it without @require_auth (worker/console contract).


  scope "/api", RadasWeb do
    pipe_through :legacy_auth

    get "/auth/me", AuthController, :me

    # Inventory (Phase 6): groups/hosts/vars over the project repo layout.
    get "/inventory/groups", InventoryController, :groups_show
    post "/inventory/groups", InventoryController, :groups_add
    delete "/inventory/groups/:group_name", InventoryController, :groups_delete
    get "/inventory/hosts", InventoryController, :hosts_show
    get "/inventory/group-vars/:group_name", InventoryController, :group_vars_show
    put "/inventory/group-vars/:group_name", InventoryController, :group_vars_put
    get "/inventory/host-vars/:host_name", InventoryController, :host_vars_show
    put "/inventory/host-vars/:host_name", InventoryController, :host_vars_put

    # Templates (Phase 6-3): catalog + render. The full 29-template Python
    # catalog port continues; generic ships first.
    get "/templates", TemplatesController, :list
    get "/templates/:template_id", TemplatesController, :show
    post "/templates/:template_id/render", TemplatesController, :render

    # Ansible run: creates the shared QUEUED execution record (the runner
    # subprocess stays on Flask during coexistence).
    post "/run_ansible", TemplatesController, :run

    # Playbooks (Phase 6-2): dual-store (ui JSON + repo YAML).
    get "/projects/:project_id/playbooks", PlaybooksController, :list
    post "/projects/:project_id/playbooks", PlaybooksController, :create
    get "/projects/:project_id/playbooks/:playbook_id", PlaybooksController, :show
    put "/projects/:project_id/playbooks/:playbook_id", PlaybooksController, :update
    delete "/projects/:project_id/playbooks/:playbook_id", PlaybooksController, :delete
    put "/projects/:project_id/playbooks-yaml", PlaybooksController, :yaml_save

    get "/orgs", IdentityController, :orgs_list
    post "/orgs", IdentityController, :orgs_create
    get "/orgs/:org_id", IdentityController, :orgs_show
    get "/orgs/:org_id/members", IdentityController, :members_list
    post "/orgs/:org_id/members", IdentityController, :members_add
    patch "/orgs/:org_id/members/:user_id", IdentityController, :members_set_role
    delete "/orgs/:org_id/members/:user_id", IdentityController, :members_remove

    get "/users", IdentityController, :users_list
    post "/users", IdentityController, :users_create
    get "/users/:user_id", IdentityController, :users_show
    put "/users/:user_id", IdentityController, :users_update
    delete "/users/:user_id", IdentityController, :users_delete
    post "/users/:user_id/roles", IdentityController, :users_add_role

    # RBAC roles/permissions only — /api/roles/{storage,config,file} are the
    # Ansible-roles filesystem surface and land with Phase 6.
    get "/roles", IdentityController, :roles_list
    post "/roles", IdentityController, :roles_create
    get "/roles/:role_id", IdentityController, :roles_show
    put "/roles/:role_id", IdentityController, :roles_update
    delete "/roles/:role_id", IdentityController, :roles_delete
    get "/permissions", IdentityController, :permissions_list
    get "/permissions/:perm_id", IdentityController, :permissions_show
  end

  # Worker protocol — registration / heartbeat / system-info served by
  # Elixir (shared Postgres worker_tokens index + profile files). Claim,
  # execution log, and finish stay on Flask via nginx while the execution
  # pipeline is filesystem-bound (see elixir-phase4-notes.md).
  pipeline :worker do
    plug :accepts, ["json"]
  end

  scope "/api/worker", RadasWeb do
    pipe_through :worker

    post "/register", WorkerController, :register
    post "/heartbeat", WorkerController, :heartbeat
    post "/system-info", WorkerController, :system_info
    post "/claim", WorkerController, :claim
    post "/executions/:execution_id/log", WorkerController, :execution_log
    post "/executions/:execution_id/finish", WorkerController, :execution_finish
  end

  scope "/api/worker", RadasWeb do
    # Fallback so mis-routed worker calls get a JSON 404 instead of HTML.
    pipe_through :worker
  end

  # Cost namespace — PUBLIC by parity with the Python blueprint (which ships
  # without auth decorators); hardening is a deliberate follow-up.
  scope "/api/cost", RadasWeb do
    pipe_through :api

    get "/pricing", CostController, :pricing_list
    get "/pricing/:provider", CostController, :pricing_show
    put "/pricing/:provider", CostController, :pricing_update
    get "/pricing/:provider/history", CostController, :pricing_history
    post "/estimate", CostController, :estimate
    get "/estimates", CostController, :estimates_list
    post "/estimates", CostController, :estimates_save
    delete "/estimates/:estimate_id", CostController, :estimates_delete
    get "/reports", CostController, :reports_list
    get "/reports/:report_id", CostController, :reports_show
    delete "/reports/:report_id", CostController, :reports_delete
    post "/reports", CostController, :reports_create
    post "/extract/plan", CostController, :extract_from_plan
  end

  scope "/api/v1", RadasWeb do
    pipe_through :gateway

    get "/models", AIGatewayController, :models
    post "/chat/completions", AIGatewayController, :chat_completions
    post "/embeddings", AIGatewayController, :embeddings
    post "/audio/transcriptions", AIGatewayController, :audio_transcriptions
    post "/audio/speech", AIGatewayController, :audio_speech
    get "/audio/voices", AIGatewayController, :audio_voices
    post "/compress", AIGatewayController, :compress
    post "/videos/:action", AIGatewayController, :video_create
    get "/videos/:video_id", AIGatewayController, :video_status
    post "/images/generations", AIGatewayController, :images_generations
    post "/responses", AIGatewayController, :responses_create
    post "/responses/compact", AIGatewayController, :responses_compact
    get "/responses/:response_id", AIGatewayController, :responses_show
  end

  scope "/api/orgs/:org_id/ai", RadasWeb do
    pipe_through :ai_management

    # Providers
    get "/providers", AIManagementController, :providers_show
    post "/providers", AIManagementController, :providers_save
    patch "/providers/:provider_id", AIManagementController, :providers_update
    delete "/providers/:provider_id", AIManagementController, :providers_delete

    # Routes (combos)
    get "/routes", AIManagementController, :routes_show
    post "/routes", AIManagementController, :routes_save
    delete "/routes/:route_id", AIManagementController, :routes_delete

    # Usage / logs / costs
    get "/usage", AIManagementController, :usage
    get "/logs", AIManagementController, :logs
    get "/costs", AIManagementController, :costs

    # Proxy pools
    get "/proxy-pools", AIManagementController, :proxy_pools_show
    post "/proxy-pools", AIManagementController, :proxy_pools_save
    delete "/proxy-pools/:pool_id", AIManagementController, :proxy_pools_delete
    post "/proxy-pools/:pool_id/test", AIManagementController, :proxy_pools_test

    # OAuth
    get "/oauth/providers", AIManagementController, :oauth_providers_list
    post "/oauth/:provider/begin", AIManagementController, :oauth_begin
    post "/oauth/:provider/complete", AIManagementController, :oauth_complete
    post "/oauth/:provider/device/begin", AIManagementController, :oauth_device_begin
    post "/oauth/:provider/device/complete", AIManagementController, :oauth_device_complete
    post "/oauth/:provider/import-token", AIManagementController, :oauth_import_token
    get "/oauth/accounts", AIManagementController, :oauth_accounts_show
    delete "/oauth/accounts/:account_id", AIManagementController, :oauth_accounts_delete

    # Endpoint keys
    get "/endpoint-keys", AIManagementController, :endpoint_keys_show
    post "/endpoint-keys", AIManagementController, :endpoint_keys_save
    delete "/endpoint-keys/:key_id", AIManagementController, :endpoint_keys_delete

    # Multi-account credentials
    get "/accounts", AIManagementController, :accounts_show
    post "/accounts", AIManagementController, :accounts_save
  end
end
