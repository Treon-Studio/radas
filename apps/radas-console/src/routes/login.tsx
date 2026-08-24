import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiEyeOffLine as EyeOff } from "@remixicon/react";
import { RadasLogo } from "@/components/common/RadasLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/auth";
import { api, setToken, saveUser } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { code?: string; state?: string } => ({
    code: (search.code as string) || undefined,
    state: (search.state as string) || undefined,
  }),
});

function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { data: sso } = useQuery({
    queryKey: ["sso-status"],
    queryFn: () => api<{ configured: boolean }>("GET", "/api/oidc/config"),
  });

  const { data: googleConfig } = useQuery({
    queryKey: ["google-sso-config"],
    queryFn: () => api<{ success: boolean; enabled: boolean }>("GET", "/api/auth/google/config"),
  });

  // Handle Google OAuth callback if code is present in query parameters
  useEffect(() => {
    if (search.code) {
      setGoogleLoading(true);
      const redirectUri = window.location.origin + "/login";
      api<{ success: boolean; token: string; refresh_token: string; user: unknown }>(
        "POST",
        "/api/auth/google/callback",
        { code: search.code, redirect_uri: redirectUri }
      )
        .then((res) => {
          if (res.success && res.token) {
            setToken(res.token, res.refresh_token);
            if (res.user) saveUser(res.user);
            toast.success("Successfully authenticated with Google");
            navigate({ to: "/dashboard", replace: true });
          }
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "Google authentication failed");
          setGoogleLoading(false);
        });
    }
  }, [search.code, navigate]);

  const mutation = useMutation({
    mutationFn: ({ u, p }: { u: string; p: string }) => login(u, p),
    onSuccess: () => navigate({ to: "/dashboard", replace: true }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("auth.login.error"));
    },
  });

  const form = useForm({
    defaultValues: { username: "", password: "" },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ u: value.username, p: value.password });
    },
  });

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const redirectUri = window.location.origin + "/login";
      const data = await api<{ success: boolean; url: string }>("GET", `/api/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error("Failed to initialize Google SSO");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left — Login Form */}
      <div className="flex flex-col items-center justify-center p-6 bg-[var(--color-background)]">
        <div className="w-full max-w-sm space-y-6 flex-1 flex flex-col justify-center">
          {/* Mobile brand */}
          <div className="flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-muted)]">
              <RadasLogo className="h-7 w-7 text-[var(--color-primary)]" />
            </div>
            <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.login.title")}</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("auth.login.credentialsPrompt")}
            </p>
          </div>

          {/* Google SSO Button */}
          {googleConfig?.enabled !== false && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-muted)] transition-colors shadow-sm disabled:opacity-50"
              >
                <GoogleIcon className="h-5 w-5" />
                <span>{googleLoading ? "Connecting with Google..." : "Continue with Google"}</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[var(--color-border)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[var(--color-background)] px-2 text-[var(--color-muted-foreground)]">
                    Or continue with password
                  </span>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }}
            className="space-y-4"
          >
            <form.Field name="username" validators={{ onChange: ({ value }) => !value ? t("common.required") : undefined }}>
              {(field) => (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t("auth.login.username")}</label>
                  <Input value={field.state.value} onChange={e => field.handleChange(e.target.value)} required autoFocus />
                </div>
              )}
            </form.Field>
            <form.Field name="password" validators={{ onChange: ({ value }) => !value ? t("common.required") : undefined }}>
              {(field) => (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t("auth.login.password")}</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={field.state.value}
                      onChange={e => field.handleChange(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting || mutation.isPending || googleLoading}>
                  {mutation.isPending ? t("common.loading") : t("auth.login.submit")}
                </Button>
              )}
            </form.Subscribe>
          </form>

          <div className="text-center">
            <a
              href="/forgot-password"
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              {t("auth.forgot.title")}
            </a>
          </div>

          {sso?.configured && (
            <a
              href="/api/auth/sso"
              className="flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-muted)] transition-colors"
            >
              Continue with Enterprise SSO
            </a>
          )}
        </div>
      </div>

      {/* Right — Branding */}
      <div className="relative hidden lg:flex flex-col justify-between bg-[var(--color-card)] text-[var(--color-foreground)] border-l border-[var(--color-border)] p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-muted)]">
            <RadasLogo className="h-7 w-7 text-[var(--color-primary)]" />
          </div>
          <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-3xl font-medium tracking-tight leading-tight">
            {t("auth.login.tagline")}
          </h1>
          <p className="text-lg text-[var(--color-charcoal)]">
            {t("auth.login.subtitle")}
          </p>
        </div>

        <div className="text-xs font-mono text-[var(--color-stone)]">
          <span>© {new Date().getFullYear()} {t("app.name")}. {t("auth.login.rightsReserved")}</span>
        </div>
      </div>
    </div>
  );
}
