import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RiEyeLine as Eye, RiEyeOffLine as EyeOff } from "@remixicon/react";
import logoSvg from "@/assets/opensible-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/auth";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const { data: sso } = useQuery({
    queryKey: ["sso-status"],
    queryFn: () => api<{ configured: boolean }>("GET", "/api/oidc/config"),
  });

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

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left — Login Form */}
      <div className="flex flex-col items-center justify-center p-6 bg-[var(--color-background)]">
        <div className="w-full max-w-sm space-y-6 flex-1 flex flex-col justify-center">
          {/* Mobile brand */}
          <div className="flex items-center justify-center gap-3 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg">
            <img src={logoSvg} className="h-10 w-10" alt="OpenSible" />
          </div>
            <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.login.title")}</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("auth.login.credentialsPrompt")}
            </p>
          </div>

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
                <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting || mutation.isPending}>
                  {mutation.isPending ? t("common.loading") : t("auth.login.submit")}
                </Button>
              )}
            </form.Subscribe>
          </form>

          {sso?.configured && (
            <a
              href="/api/auth/sso"
              className="flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-muted)] transition-colors"
            >
              Continue with SSO
            </a>
          )}
        </div>
      </div>

      {/* Right — Branding */}
      <div className="relative hidden lg:flex flex-col justify-between bg-[var(--color-card)] text-[var(--color-foreground)] border-l border-[var(--color-border)] p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg">
            <img src={logoSvg} className="h-10 w-10" alt="OpenSible" />
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
