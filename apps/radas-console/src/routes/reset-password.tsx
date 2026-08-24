import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RiEyeLine as Eye, RiEyeOffLine as EyeOff } from "@remixicon/react";
import { RadasLogo } from "@/components/common/RadasLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const mutation = useMutation({
    mutationFn: ({ p }: { p: string }) =>
      api("POST", "/api/auth/reset-password", { token, password: p }),
    onSuccess: () => {
      toast.success(t("auth.reset.success"));
      navigate({ to: "/login", replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("auth.reset.error"));
    },
  });

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirm) {
        toast.error(t("auth.reset.mismatch"));
        return;
      }
      await mutation.mutateAsync({ p: value.password });
    },
  });

  const passwordStrength = (p: string): string | null => {
    if (p.length < 12) return t("auth.reset.minLength");
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(p)).length;
    if (classes < 3) return t("auth.reset.complexity");
    return null;
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left — Reset Password Form */}
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
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.reset.title")}</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("auth.reset.subtitle")}
            </p>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }}
            className="space-y-4"
          >
            <form.Field
              name="password"
              validators={{ onChange: ({ value }) => passwordStrength(value) }}
            >
              {(field) => (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t("auth.reset.newPassword")}</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                      autoComplete="new-password"
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
                  {field.state.meta.errors?.length ? (
                    <p className="text-xs text-[var(--color-destructive)]">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>
            <form.Field
              name="confirm"
              validators={{ onChange: ({ value }) => !value ? t("common.required") : undefined }}
            >
              {(field) => (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t("auth.reset.confirmPassword")}</label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((s) => !s)}
                      aria-label={showConfirm ? t("common.hidePassword") : t("common.showPassword")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" className="w-full" disabled={!token || !canSubmit || isSubmitting || mutation.isPending}>
                  {isSubmitting || mutation.isPending ? t("common.loading") : t("auth.reset.submit")}
                </Button>
              )}
            </form.Subscribe>
            <Link to="/login" className="block text-center text-sm text-[var(--color-primary)] hover:underline">
              {t("auth.forgot.backToLogin")}
            </Link>
          </form>
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
            {t("auth.forgot.tagline")}
          </h1>
          <p className="text-lg text-[var(--color-charcoal)]">
            {t("auth.reset.subtitle")}
          </p>
        </div>
        <div className="text-xs font-mono text-[var(--color-stone)]">
          <span>© {new Date().getFullYear()} {t("app.name")}. {t("auth.login.rightsReserved")}</span>
        </div>
      </div>
    </div>
  );
}