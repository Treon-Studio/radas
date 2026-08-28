import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiLockPasswordLine as Lock,
  RiFileCopyLine as Copy,
  RiRefreshLine as Refresh,
  RiShieldCheckLine as ShieldCheck,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { QueryStateView } from "@/components/system/QueryStateView";
import { SecretInput } from "@/components/system/SecretInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, apiErrorTitle, newIdempotencyKey } from "@/lib/api";

export const Route = createFileRoute("/system/mfa")({ component: MfaPage });

type StatusResponse = { enabled?: boolean };
type EnableResponse = { success?: boolean; secret?: string; otpauth_url?: string };

function copyValue(label: string, value: string) {
  const clipboard = (navigator as { clipboard?: { writeText?: (text: string) => Promise<void> } }).clipboard;
  if (!clipboard?.writeText) {
    toast.error(`${label} could not be copied`);
    return;
  }
  void clipboard.writeText(value).then(
    () => toast.success(`${label} copied to clipboard`),
    () => toast.error(`${label} could not be copied`),
  );
}

/**
 * TOTP multi-factor enrollment. The generated secret and one-time codes only
 * live in component state and POST bodies — never in URLs, query strings, or
 * query keys — and are never logged.
 */
export function MfaPage() {
  const qc = useQueryClient();

  const [pendingSecret, setPendingSecret] = useState("");
  const [provisioningUrl, setProvisioningUrl] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);

  const statusQ = useQuery({
    // Static key: the secret/code never participate in cache keys.
    queryKey: ["mfa-status"],
    queryFn: () => api<StatusResponse>("GET", "/api/auth/mfa/status"),
  });

  const enableMut = useMutation({
    mutationFn: () =>
      api<EnableResponse>("POST", "/api/auth/mfa/enable", undefined, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: (data) => {
      setPendingSecret(typeof data?.secret === "string" ? data.secret : "");
      setProvisioningUrl(typeof data?.otpauth_url === "string" ? data.otpauth_url : "");
      setConfirmCode("");
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const confirmMut = useMutation({
    mutationFn: (payload: { secret: string; code: string }) =>
      api<{ success?: boolean; message?: string }>("POST", "/api/auth/mfa/confirm", payload, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: () => {
      toast.success("MFA enabled");
      // Drop the one-time secret from memory once enrollment completes.
      setPendingSecret("");
      setProvisioningUrl("");
      setConfirmCode("");
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: () => {
      // Invalid codes are retried in place; the pending secret stays put.
      setConfirmCode("");
    },
  });

  const disableMut = useMutation({
    mutationFn: (code: string) =>
      api<{ success?: boolean; message?: string }>("POST", "/api/auth/mfa/disable", { code }, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: () => {
      toast.success("MFA disabled");
      setDisableOpen(false);
      setDisableCode("");
      void qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitConfirm = () => {
    if (!pendingSecret) return;
    if (!confirmCode.trim()) {
      toast.error("Validation failed: enter the 6-digit code from your authenticator");
      return;
    }
    confirmMut.mutate({ secret: pendingSecret, code: confirmCode.trim() });
  };

  const enabled = statusQ.data?.enabled === true;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Lock className="h-5 w-5 text-[var(--color-primary)]" /> Multi-Factor Authentication
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            TOTP second factor for your account (Google Authenticator compatible).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void statusQ.refetch()} disabled={statusQ.isPending}>
          <Refresh className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <QueryStateView
        loading={statusQ.isPending}
        error={statusQ.error}
        onRetry={() => void statusQ.refetch()}
        forbiddenMessage="Sign in to manage multi-factor authentication."
      />

      {statusQ.isSuccess && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)] flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Account status
            </CardTitle>
            {enabled ? (
              <Badge variant="success" className="text-[10px] uppercase">Enabled</Badge>
            ) : (
              <Badge variant="warning" className="text-[10px] uppercase">Not enabled</Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {enabled
                ? "Sign-in requires a time-based one-time password from your authenticator app."
                : "Add a second factor so a stolen password alone cannot access your account."}
            </p>
            {enabled ? (
              <Button variant="destructive" size="sm" onClick={() => setDisableOpen(true)}>
                Disable…
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => enableMut.mutate()}
                disabled={enableMut.isPending || confirmMut.isPending}
              >
                {enableMut.isPending ? "Generating…" : "Enable MFA"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {pendingSecret && !enabled && (
        <Card data-testid="mfa-enrollment">
          <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)]">
            <CardTitle className="text-sm font-semibold">Set up your authenticator</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              This secret is shown only once. Store it in your authenticator app now — it will not be
              displayed again after enrollment completes.
            </p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm bg-[var(--color-muted)]/40 rounded px-2 py-1 break-all" data-testid="mfa-secret">
                {pendingSecret}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                aria-label="Copy secret"
                onClick={() => copyValue("Secret", pendingSecret)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {provisioningUrl && (
              <div className="flex items-start gap-2">
                <code
                  className="font-mono text-xs bg-[var(--color-muted)]/40 rounded px-2 py-1 break-all max-w-[520px]"
                  data-testid="mfa-otpauth-url"
                >
                  {provisioningUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  aria-label="Copy provisioning URI"
                  onClick={() => copyValue("Provisioning URI", provisioningUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Authenticator code
                <SecretInput
                  aria-label="Authenticator code"
                  placeholder="123456"
                  inputMode="numeric"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitConfirm(); }}
                  className="mt-1 max-w-[220px]"
                />
              </label>
              <Button size="sm" onClick={submitConfirm} disabled={confirmMut.isPending}>
                {confirmMut.isPending ? "Verifying…" : "Confirm enrollment"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={disableOpen}
        title="Disable MFA"
        description="Your account will again be protected by password only. Enter a current authenticator code to confirm."
        confirmLabel="Disable MFA"
        variant="destructive"
        busy={disableMut.isPending}
        confirmDisabled={!disableCode.trim()}
        onConfirm={() => disableMut.mutate(disableCode.trim())}
        onCancel={() => { setDisableOpen(false); setDisableCode(""); }}
      >
        <SecretInput
          aria-label="Current authenticator code"
          placeholder="123456"
          inputMode="numeric"
          value={disableCode}
          onChange={(e) => setDisableCode(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
