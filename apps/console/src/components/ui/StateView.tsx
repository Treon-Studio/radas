import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MascotLoading } from "@/components/common/MascotLoading";
import { MascotState, type MascotStateType } from "@/components/common/MascotState";

type Props = {
  state: "loading" | "empty" | "error";
  title?: string;
  message?: string;
  onRetry?: () => void;
  action?: ReactNode;
  mascotType?: MascotStateType;
};

function resolveErrorMascot(title?: string, message?: string): MascotStateType {
  const combined = `${title ?? ""} ${message ?? ""}`.toLowerCase();
  if (combined.includes("403") || combined.includes("access") || combined.includes("denied") || combined.includes("forbidden") || combined.includes("permission")) {
    return "error_access_denied";
  }
  if (combined.includes("timeout") || combined.includes("timed out")) {
    return "error_timeout";
  }
  if (combined.includes("connection") || combined.includes("network") || combined.includes("offline") || combined.includes("disconnect")) {
    return "error_connection";
  }
  if (combined.includes("404") || combined.includes("not found")) {
    return "error_404";
  }
  if (combined.includes("budget") || combined.includes("quota") || combined.includes("cost")) {
    return "error_budget_exceeded";
  }
  if (combined.includes("500") || combined.includes("server error")) {
    return "error_500";
  }
  return "error_crash";
}

function resolveEmptyMascot(title?: string, message?: string): MascotStateType {
  const combined = `${title ?? ""} ${message ?? ""}`.toLowerCase();
  if (combined.includes("project")) return "empty_projects";
  if (combined.includes("stack") || combined.includes("tofu") || combined.includes("terraform")) return "empty_stacks";
  if (combined.includes("playbook") || combined.includes("ansible")) return "empty_playbooks";
  if (combined.includes("secret") || combined.includes("vault") || combined.includes("key")) return "empty_secrets";
  if (combined.includes("audit") || combined.includes("compliance") || combined.includes("history")) return "empty_audit";
  if (combined.includes("webhook")) return "empty_webhooks";
  if (combined.includes("search") || combined.includes("result")) return "empty_search";
  if (combined.includes("deploy") || combined.includes("pipeline") || combined.includes("run")) return "empty_deployments";
  if (combined.includes("log")) return "empty_logs";
  if (combined.includes("inbox") || combined.includes("notification") || combined.includes("message")) return "empty_inbox";
  return "empty_database";
}

/** Standardized loading / empty / error states with animated Haro Mascot. */
export function StateView({ state, title, message, onRetry, action, mascotType }: Props) {
  if (state === "loading") {
    return (
      <div role="status" aria-live="polite" className="w-full py-6">
        <MascotLoading
          label={title || "LOADING SYSTEM DATA..."}
          sublabel={message}
          size="md"
        />
        {action && <div className="mt-2 flex justify-center">{action}</div>}
      </div>
    );
  }

  if (state === "error") {
    const errorType = mascotType ?? resolveErrorMascot(title, message);
    return (
      <div role="alert" aria-live="assertive" className="w-full py-6">
        <MascotState
          type={errorType}
          title={title || "SOMETHING WENT WRONG"}
          description={message}
          actionLabel={onRetry ? "TRY AGAIN" : undefined}
          onAction={onRetry}
        />
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </div>
    );
  }

  const emptyType = mascotType ?? resolveEmptyMascot(title, message);
  return (
    <div className="w-full py-6">
      <MascotState
        type={emptyType}
        title={title || "NO DATA AVAILABLE"}
        description={message}
      />
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
