import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-shell/Header";
import { getActiveSection, SidebarNav } from "@/components/app-shell/NavSections";
import { getToken, api } from "@/lib/api";

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-background)]">
      <div className="max-w-md text-center p-6 border-2 border-red-500 bg-[var(--color-card)] pxl-corner-sm pxl-card-shadow">
        <h1 className="font-mono text-base font-bold mb-2 uppercase text-red-500">System Error</h1>
        <p className="font-mono text-xs text-[var(--color-muted-foreground)]">{error.message}</p>
      </div>
    </div>
  ),
});

export type RootRedirectInput = {
  path: string;
  token: string | null;
  onboardingStatus: { completed: boolean } | undefined;
};

export function isPublicPath(path: string): boolean {
  return (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/onboarding")
  );
}

/**
 * Pure routing decision so auth/onboarding redirects stay testable without
 * mounting the router. Mirrors RootLayout's effect exactly.
 */
export function resolveRootRedirect({ path, token, onboardingStatus }: RootRedirectInput): string | null {
  if (!token) {
    return isPublicPath(path) ? null : "/login";
  }
  if (isPublicPath(path)) return null;
  if (onboardingStatus && onboardingStatus.completed === false && path !== "/onboarding") {
    return "/onboarding";
  }
  return null;
}

function RootLayout() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  // Check onboarding status for authenticated users
  const { data: onboardingStatus, isLoading: onboardingLoading } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => api<{ completed: boolean }>("GET", "/api/onboarding/status"),
    enabled: !!getToken() && !isPublicPath(location.pathname),
    retry: false,
  });

  useEffect(() => {
    const redirect = resolveRootRedirect({
      path: location.pathname,
      token: getToken(),
      onboardingStatus,
    });
    if (redirect) navigate({ to: redirect, replace: true });
  }, [location.pathname, navigate, onboardingStatus]);

  if (isPublicPath(location.pathname)) {
    return <Outlet />;
  }

  if (!ready) return null;

  const isDashboard = location.pathname === "/dashboard" || location.pathname === "/";

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-background)] text-[var(--color-foreground)] font-mono selection:bg-[var(--color-primary)] selection:text-[var(--color-primary-foreground)] overflow-hidden">
      {/* Background Retro Grid Texture */}
      <div className="fixed inset-0 pointer-events-none opacity-30 bg-grid-pattern" data-pxlkit="grid-bg" />

      <AppHeader />

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {!isDashboard && (
          <aside className="w-64 shrink-0 border-r-2 border-[var(--color-border)] bg-[var(--color-card)]/40 overflow-y-auto">
            <SidebarNav />
          </aside>
        )}
        <main className="flex-1 overflow-y-auto px-8 py-8 lg:px-10 bg-[var(--color-background)]">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
export default RootLayout;
