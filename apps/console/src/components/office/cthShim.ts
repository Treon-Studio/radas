// Full window.cth bridge shim — covers the entire munder-difflin preload
// API surface (193 methods, extracted from src/preload/index.ts). The
// console has no Electron harness behind it, so every method degrades:
//   - on<Verb> subscriptions return a no-op unsubscribe (sync)
//   - command/query methods resolve null (all renderer call sites handle
//     null/falsy results gracefully)
// When the desktop app ports the real main-process harness, this shim is
// replaced by the real preload bridge.

export type CthApi = Record<string, (...args: unknown[]) => unknown>;

declare global {
  interface Window {
    cth?: CthApi;
  }
}

const SUBSCRIPTIONS = new Set([
  "onApprovalRequest",
  "onAutoCompact",
  "onBreakerState",
  "onCloseRequested",
  "onClosingTime",
  "onConfigChanged",
  "onContextTrigger",
  "onHireError",
  "onHireImport",
  "onHiveAgentArchived",
  "onHiveAgentSpawned",
  "onHiveContextUpdate",
  "onHiveEnqueue",
  "onHiveHookEvent",
  "onHiveMessage",
  "onHiveTerminalHandoff",
  "onMissionsUpdated",
  "onPowerResume",
  "onPtyData",
  "onPtyExit",
  "onPtyRelaunch",
  "onRealtimeCompletion",
  "onRealtimeEnqueue",
  "onRealtimeFloorDelta",
  "onSlackMessage",
  "onTelemetryEvent",
  "onTriggerHistoryUpdated",
  "onUpdateStatus",
]);

const COMMANDS = new Set([
  "agentContext",
  "agentUsage",
  "appInfo",
  "arch",
  "attachFiles",
  "cancelClose",
  "cancelClosingTime",
  "changeHome",
  "chooseFolder",
  "clearTriggerHistory",
  "confirmClose",
  "controlAutoDelivery",
  "controlGateTool",
  "controlHalt",
  "controlPause",
  "controlResume",
  "controlSnapshot",
  "controlSteer",
  "copyToClipboard",
  "decideTriggerHistory",
  "deleteWebhook",
  "drainPendingHires",
  "ensureHarnessHome",
  "freeflowSetConfig",
  "freeflowTranscribe",
  "generateWebhookSecret",
  "getConfig",
  "getContextTrigger",
  "getOrgTrigger",
  "gitAheadBehind",
  "gitBranch",
  "gitBranches",
  "gitCheckout",
  "gitCommitFiles",
  "gitCompareRefs",
  "gitDiff",
  "gitIsRepo",
  "gitLog",
  "gitLogGraph",
  "gitMainRepo",
  "gitShowFile",
  "gitStatus",
  "gitWorktrees",
  "githubCIRuns",
  "githubIssues",
  "harnessHomeSync",
  "heroPayload",
  "historyAdd",
  "historyList",
  "historySearch",
  "hiveAddTask",
  "hiveAgentDirectory",
  "hiveBoard",
  "hiveDeleteTask",
  "hiveInbox",
  "hiveLog",
  "hiveMemory",
  "hiveMessages",
  "hivePatchAgentRole",
  "hivePatchTask",
  "hiveRegistry",
  "hiveRenameAgent",
  "hiveSend",
  "hiveSetAgentHold",
  "hiveSetArchived",
  "hiveTasks",
  "importHireFiles",
  "integrationsList",
  "integrationsRemove",
  "integrationsSetSecret",
  "integrationsTemplates",
  "integrationsTest",
  "integrationsUpsert",
  "kgAddFiles",
  "kgGet",
  "kgIngestFiles",
  "kgList",
  "kgRemove",
  "kgSearch",
  "kgStatus",
  "killPty",
  "listDir",
  "listMissions",
  "listPtys",
  "listTriggerHistory",
  "listWebhooks",
  "listWorkers",
  "memoryStatus",
  "memoryWakeUp",
  "mineNow",
  "newFloor",
  "openExternal",
  "openTerminalAt",
  "pathForFile",
  "platform",
  "providerKeyClear",
  "providerKeyHas",
  "providerKeySet",
  "readBinary",
  "readClipboard",
  "readClipboardSync",
  "readFile",
  "realtimeAction",
  "realtimeActionCancel",
  "realtimeActionConfirm",
  "realtimeDrainCompletions",
  "realtimeHasOpenAiKey",
  "realtimeMintToken",
  "realtimeSetSessionLive",
  "realtimeWaitFor",
  "redrawPty",
  "reflectNow",
  "resetAll",
  "resizePty",
  "resolveSessionCwd",
  "revealPath",
  "rosterReadSync",
  "rosterWrite",
  "saveClipboardImage",
  "saveMissions",
  "saveWebhooks",
  "searchMemory",
  "setAgentTokenCap",
  "setBreakerState",
  "setContextTrigger",
  "setLoginItem",
  "setNotifications",
  "setOrgTrigger",
  "skillsCatalog",
  "skillsInstall",
  "skillsLocal",
  "skillsReveal",
  "skillsUninstall",
  "slackReply",
  "slackReplyScriptPath",
  "slackSetConfig",
  "slackStart",
  "slackStatus",
  "slackStop",
  "spawnPty",
  "startClosingTime",
  "statAbs",
  "stopWorker",
  "telemetrySnapshot",
  "telemetrySpans",
  "telemetryUsage",
  "textSearch",
  "toolsStatus",
  "trackMessageSent",
  "updateCheckNow",
  "updateConfig",
  "updateCurrent",
  "updateDownload",
  "updateOpenRelease",
  "updateRestartAndInstall",
  "updateSimulate",
  "version",
  "webhookGenerateSecret",
  "webhookSetConfig",
  "webhookStart",
  "webhookStatus",
  "webhookStop",
  "webhooksStatus",
  "writeFile",
  "writePty",
]);

export function buildCthShim(): CthApi {
  const noop = () => {};

  // Static string properties on the real bridge (read WITHOUT calling).
  const STATIC: Record<string, string> = {
    platform: "browser",
    arch: "unknown",
    version: "0.0.0-cth-shim",
  };

  // sendSync-backed reads: the real preload returns the value immediately
  // (the store builds its roster at module load — an async answer would
  // arrive too late). null = "nothing to read"; every call site uses
  // optional-call + null-coalesce, so null degrades cleanly.
  const SYNC_NULL = new Set(["rosterReadSync", "harnessHomeSync", "readClipboardSync"]);

  return new Proxy({} as CthApi, {
    get(_t, prop: string) {
      if (prop in STATIC) return STATIC[prop];

      if (SYNC_NULL.has(prop)) return null;

      if (prop === "pathForFile") {
        // sync string pass-through — used to build asset/img URLs
        return (f: unknown) => String(f ?? "");
      }

      if (SUBSCRIPTIONS.has(prop)) {
        // sync listener registration — must return an unsubscribe function
        return () => noop;
      }
      if (COMMANDS.has(prop)) {
        // degrade to a resolved null; consumers handle falsy results
        return (..._args: unknown[]) => Promise.resolve(null);
      }
      // Unknown keys degrade too: a callable that resolves null (covers
      // preload methods missed by the extracted key list) and exposes a
      // .then that is itself callable-thenable, so `await` and `.then`
      // chains both work without crashing.
      const permissive = () => Promise.resolve(null);
      return new Proxy(permissive as object, {
        get(t2, p2: string) {
          if (p2 === "then") return (res: (v: unknown) => unknown) => res(null);
          return undefined;
        },
      });
    },
  });
}

// Self-install: the console has no real preload bridge, so the shim is the
// whole window.cth surface. Guarded so a real bridge (desktop preload port)
// always wins.
if (typeof window !== "undefined" && !window.cth) {
  window.cth = buildCthShim();
}
