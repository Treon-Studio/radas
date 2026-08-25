import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RadasLogo } from "@/components/common/RadasLogo";
import { PixelIcon } from "@/components/common/PixelIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="#EA4335" d="M4 0h6v1H4zm-2 1h10v1H2zm-1 1h4v1H1zm8 0h4v1H9zm1 1h4v1h-4z" />
      <path fill="#4285F4" d="M12 4h2v2h-2zm-4 2h6v2H8zm4 2h2v2h-2zm-2 2h4v1h-4z" />
      <path fill="#FBBC05" d="M0 3h4v2H0zm0 2h4v2H0zm0 2h4v2H0zm0 2h2v2H0z" />
      <path fill="#34A853" d="M2 10h2v1H2zm-1 1h4v1H1zm8 0h4v1H9zm-7 1h10v1H2zm2 1h6v1H4z" />
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
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 bg-[#CDEADC] overflow-hidden">
      {/* Full-Screen Japanese Soft Pastel Green Sky & Clouds Wallpaper */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <img
          src="/images/bg-clouds-japanese-pastel-green.webp"
          alt="Japanese Soft Pastel Green Sky and Clouds Wallpaper"
          className="w-full h-full object-cover object-bottom"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Soft Ambient Tint */}
        <div className="absolute inset-0 bg-[#000000]/3 pointer-events-none" />
      </div>

      {/* Twinkling 8-Bit Pixel Sparkles & Stars in the Sky */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {[
          { top: "6%", left: "12%", size: "lg", delay: "0s" },
          { top: "14%", left: "25%", size: "sm", delay: "1.2s" },
          { top: "5%", left: "50%", size: "md", delay: "0.7s" },
          { top: "10%", left: "75%", size: "lg", delay: "1.8s" },
          { top: "18%", left: "88%", size: "sm", delay: "0.4s" },
          { top: "24%", left: "15%", size: "md", delay: "2.1s" },
          { top: "20%", left: "82%", size: "lg", delay: "1.0s" },
          { top: "4%", left: "65%", size: "sm", delay: "1.5s" },
          { top: "30%", left: "32%", size: "sm", delay: "0.9s" },
          { top: "32%", left: "68%", size: "md", delay: "1.7s" },
        ].map((star, idx) => (
          <div
            key={idx}
            className="absolute animate-pixel-twinkle text-[#ffffff]"
            style={{
              top: star.top,
              left: star.left,
              animationDelay: star.delay,
            }}
          >
            {star.size === "lg" ? (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.95))" }}>
                <path d="M7 0h1v15h-1z M0 7h15v1h-15z M6 5h3v5h-3z M5 6h5v3h-5z" shapeRendering="crispEdges" />
              </svg>
            ) : star.size === "md" ? (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.85))" }}>
                <path d="M4 0h1v9h-1z M0 4h9v1h-9z M3 3h3v3h-3z" shapeRendering="crispEdges" />
              </svg>
            ) : (
              <svg width="5" height="5" viewBox="0 0 5 5" fill="currentColor">
                <path d="M2 0h1v5h-1z M0 2h5v1h-5z" shapeRendering="crispEdges" />
              </svg>
            )}
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Retro Mascot & Speech Bubble */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="relative shrink-0 animate-pixel-bounce">
            <img
              src="/images/haro-animated.webp"
              alt="Animated Gundam Haro Mascot"
              className="w-16 h-16 block select-none pointer-events-none"
              style={{
                imageRendering: "pixelated",
                outline: "none",
                border: "none",
                boxShadow: "none",
              }}
            />
          </div>
          <div className="nes-balloon from-left py-2 px-3.5">
            <p className="font-pixel text-[8px] text-[#212529] leading-relaxed">
              ENTER CREDENTIALS TO ACCESS RADAS CONTROL PLANE :)
            </p>
          </div>
        </div>

        {/* Pixel Form Card */}
        <Card className="border-4 border-[#212529] bg-[#ffffff] pxl-corner-sm shadow-[6px_6px_0_0_#212529]">
          <CardContent className="p-6 space-y-5">
            {/* Google SSO Button */}
            {googleConfig?.enabled !== false && (
              <div className="space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-2.5"
                >
                  <GoogleIcon className="h-4 w-4" />
                  <span>{googleLoading ? "AUTHENTICATING..." : "CONTINUE WITH GOOGLE"}</span>
                </Button>

                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[var(--color-border)]" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-mono">
                    <span className="bg-[var(--color-card)] px-2 text-[var(--color-muted-foreground)]">
                      OR ACCESS WITH CREDENTIALS
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
                  <div className="space-y-1.5">
                    <label className="font-mono text-xs font-medium text-[var(--color-foreground)] uppercase">
                      {t("auth.login.username")}
                    </label>
                    <Input
                      value={field.state.value}
                      onChange={e => field.handleChange(e.target.value)}
                      placeholder="Username / Email"
                      required
                      autoFocus
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="password" validators={{ onChange: ({ value }) => !value ? t("common.required") : undefined }}>
                {(field) => (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-xs font-medium text-[var(--color-foreground)] uppercase">
                        {t("auth.login.password")}
                      </label>
                      <a
                        href="/forgot-password"
                        className="font-mono text-[11px] text-[var(--color-primary)] hover:underline"
                      >
                        {t("auth.forgot.title")}
                      </a>
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={field.state.value}
                        onChange={e => field.handleChange(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-retro-muted)] hover:text-[var(--color-foreground)] transition-colors z-10"
                      >
                        <PixelIcon name={showPassword ? "eye-slash" : "eye"} size="sm" />
                      </button>
                    </div>
                  </div>
                )}
              </form.Field>

              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    variant="default"
                    size="default"
                    className="w-full mt-2"
                    disabled={!canSubmit || isSubmitting || mutation.isPending || googleLoading}
                  >
                    {mutation.isPending ? "SIGNING IN..." : "ENTER CONTROL PLANE"}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            {sso?.configured && (
              <div className="pt-2 border-t border-[var(--color-border)] text-center">
                <a
                  href="/api/auth/sso"
                  className="font-mono text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors flex items-center justify-center gap-1.5"
                >
                  <PixelIcon name="bolt" size="sm" />
                  <span>Continue with Enterprise SAML / OIDC</span>
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-6 text-center font-mono text-[11px] text-[var(--color-muted-foreground)]">
          <span>© {new Date().getFullYear()} Treon Studio / RADAS. MIT Licensed.</span>
        </div>
      </div>
    </div>
  );
}
export default LoginPage;
