defmodule RadasStateWeb.Router do
  use RadasStateWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, {RadasStateWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug RadasStateWeb.AuthPlug
  end

  scope "/", RadasStateWeb do
    pipe_through :browser

    get "/", PageController, :home
  end

  scope "/api", RadasStateWeb do
    pipe_through :api

    resources "/environments", EnvironmentController, except: [:new, :edit]
    resources "/feature_flags", FeatureFlagController, except: [:new, :edit]
    resources "/project_statuses", ProjectStatusController, except: [:new, :edit]
    resources "/notes", KnowledgeController, except: [:new, :edit]
    # Stub endpoints for milestone, status update, and API docs
    get "/milestones", MilestoneController, :index
    get "/status_updates", StatusUpdateController, :index
    get "/docs", DocsController, :index
  end

  # Other scopes may use custom stacks.
  # scope "/api", RadasStateWeb do
  #   pipe_through :api
  # end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:radas_state, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: RadasStateWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
