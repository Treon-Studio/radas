import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { RadasLogo } from "@/components/common/RadasLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

type ForgotResponse = {
  success?: boolean;
  message?: string;
  reset_url?: string | null;
  delivery?: { delivered?: boolean; channel?: string | null; inline?: boolean };
};

function ForgotPasswordPage() {
  const t = useT();

  const mutation = useMutation({
    mutationFn: ({ u }: { u: string }) =>
      api<ForgotResponse>("POST", "/api/auth/forgot-password", { username: u }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("auth.forgot.error"));
    },
  });

  const form = useForm({
    defaultValues: { username: "" },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ u: value.username });
    },
  });

  const sent = mutation.isSuccess;
  const resetUrl = mutation.data?.reset_url;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left — Forgot Password Form */}
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
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.forgot.title")}</h2>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("auth.forgot.subtitle")}
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-4 text-sm">
                <p className="font-medium mb-1">{t("auth.forgot.sentTitle")}</p>
                <p className="text-[var(--color-muted-foreground)]">
                  {mutation.data?.message || t("auth.forgot.sentMessage")}
                </p>
              </div>
              {resetUrl ? (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-sm space-y-2">
                  <p className="text-[var(--color-muted-foreground)]">{t("auth.forgot.inlineHint")}</p>
                  <a
                    href={resetUrl}
                    className="block break-all font-mono text-xs text-[var(--color-primary)] hover:underline"
                  >
                    {resetUrl}
                  </a>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{t("auth.forgot.expiryHint")}</p>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">{t("auth.forgot.channelHint")}</p>
              )}
              <Link to="/login" className="block text-center text-sm text-[var(--color-primary)] hover:underline">
                {t("auth.forgot.backToLogin")}
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }}
              className="space-y-4"
            >
              <form.Field
                name="username"
                validators={{ onChange: ({ value }) => !value ? t("common.required") : undefined }}
              >
                {(field) => (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{t("auth.forgot.username")}</label>
                    <Input
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                )}
              </form.Field>
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting || mutation.isPending}>
                    {isSubmitting || mutation.isPending ? t("common.loading") : t("auth.forgot.submit")}
                  </Button>
                )}
              </form.Subscribe>
              <Link to="/login" className="block text-center text-sm text-[var(--color-primary)] hover:underline">
                {t("auth.forgot.backToLogin")}
              </Link>
            </form>
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
            {t("auth.forgot.tagline")}
          </h1>
          <p className="text-lg text-[var(--color-charcoal)]">
            {t("auth.forgot.subtitle")}
          </p>
        </div>
        <div className="text-xs font-mono text-[var(--color-stone)]">
          <span>© {new Date().getFullYear()} {t("app.name")}. {t("auth.login.rightsReserved")}</span>
        </div>
      </div>
    </div>
  );
}