// RADAS Desktop preload bridge.
//
// Exposes a minimal, allowlisted API surface to both renderer windows via
// contextBridge. Renderers never see Electron, Node, or the IPC channels
// directly — every capability here maps 1:1 to a main-process handler in
// main.js, and secrets (credential tokens) are deliberately NOT part of this
// surface: they stay in the main process and are injected into the console
// window's localStorage there.
const { contextBridge, ipcRenderer } = require("electron");

// CTH bridge — generated from apps/desktop-app/cth/preload/index.ts
// (munder-difflin preload). Forwards every harness call over IPC to the
// real main-process handlers registered by dist-cth/main.cjs. 186 static
// channels + 3 dynamic pty listeners + pathForFile (webUtils).

const { webUtils } = require("electron");

const CTH_CHANNELS = {
  agentContext: (...args) => ipcRenderer.invoke("hive:agentContext", ...args),
  agentUsage: (...args) => ipcRenderer.invoke("hive:agentUsage", ...args),
  appInfo: (...args) => ipcRenderer.invoke("app:info", ...args),
  attachFiles: (...args) => ipcRenderer.invoke("dialog:attachFiles", ...args),
  cancelClose: (...args) => ipcRenderer.invoke("app:cancelClose", ...args),
  cancelClosingTime: (...args) => ipcRenderer.invoke("app:cancelClosingTime", ...args),
  changeHome: (...args) => ipcRenderer.invoke("config:changeHome", ...args),
  chooseFolder: (...args) => ipcRenderer.invoke("dialog:chooseFolder", ...args),
  clearTriggerHistory: (...args) => ipcRenderer.invoke("triggerHistory:clear", ...args),
  confirmClose: (...args) => ipcRenderer.invoke("app:confirmClose", ...args),
  controlAutoDelivery: (...args) => ipcRenderer.invoke("control:autoDelivery", ...args),
  controlGateTool: (...args) => ipcRenderer.invoke("control:gateTool", ...args),
  controlHalt: (...args) => ipcRenderer.invoke("control:halt", ...args),
  controlPause: (...args) => ipcRenderer.invoke("control:pause", ...args),
  controlResume: (...args) => ipcRenderer.invoke("control:resume", ...args),
  controlSnapshot: (...args) => ipcRenderer.invoke("control:snapshot", ...args),
  controlSteer: (...args) => ipcRenderer.invoke("control:steer", ...args),
  copyToClipboard: (...args) => ipcRenderer.invoke("app:copyToClipboard", ...args),
  decideTriggerHistory: (...args) => ipcRenderer.invoke("triggerHistory:decide", ...args),
  deleteWebhook: (...args) => ipcRenderer.invoke("webhooks:delete", ...args),
  drainPendingHires: (...args) => ipcRenderer.invoke("hire:drainPending", ...args),
  ensureHarnessHome: (...args) => ipcRenderer.invoke("config:ensureHome", ...args),
  freeflowSetConfig: (...args) => ipcRenderer.invoke("freeflow:setConfig", ...args),
  freeflowTranscribe: (...args) => ipcRenderer.invoke("freeflow:transcribe", ...args),
  generateWebhookSecret: (...args) => ipcRenderer.invoke("webhooks:generateSecret", ...args),
  getConfig: (...args) => ipcRenderer.invoke("config:get", ...args),
  getContextTrigger: (...args) => ipcRenderer.invoke("triggers:getContext", ...args),
  getOrgTrigger: (...args) => ipcRenderer.invoke("org:getTrigger", ...args),
  gitAheadBehind: (...args) => ipcRenderer.invoke("git:aheadBehind", ...args),
  gitBranch: (...args) => ipcRenderer.invoke("git:branch", ...args),
  gitBranches: (...args) => ipcRenderer.invoke("git:branches", ...args),
  gitCheckout: (...args) => ipcRenderer.invoke("git:checkout", ...args),
  gitCommitFiles: (...args) => ipcRenderer.invoke("git:commitFiles", ...args),
  gitCompareRefs: (...args) => ipcRenderer.invoke("git:compareRefs", ...args),
  gitDiff: (...args) => ipcRenderer.invoke("git:diff", ...args),
  gitIsRepo: (...args) => ipcRenderer.invoke("git:isRepo", ...args),
  gitLog: (...args) => ipcRenderer.invoke("git:log", ...args),
  gitLogGraph: (...args) => ipcRenderer.invoke("git:logGraph", ...args),
  gitMainRepo: (...args) => ipcRenderer.invoke("git:mainRepo", ...args),
  gitShowFile: (...args) => ipcRenderer.invoke("git:showFile", ...args),
  gitStatus: (...args) => ipcRenderer.invoke("git:status", ...args),
  gitWorktrees: (...args) => ipcRenderer.invoke("git:worktrees", ...args),
  githubCIRuns: (...args) => ipcRenderer.invoke("github:ciRuns", ...args),
  githubIssues: (...args) => ipcRenderer.invoke("github:issues", ...args),
  harnessHomeSync: (...args) => ipcRenderer.sendSync("config:homeSync", ...args),
  heroPayload: (...args) => ipcRenderer.invoke("hero:payload", ...args),
  historyAdd: (...args) => ipcRenderer.invoke("history:add", ...args),
  historyList: (...args) => ipcRenderer.invoke("history:list", ...args),
  historySearch: (...args) => ipcRenderer.invoke("history:search", ...args),
  hiveAddTask: (...args) => ipcRenderer.invoke("hive:addTask", ...args),
  hiveAgentDirectory: (...args) => ipcRenderer.invoke("hive:agentDirectory", ...args),
  hiveBoard: (...args) => ipcRenderer.invoke("hive:board", ...args),
  hiveDeleteTask: (...args) => ipcRenderer.invoke("hive:deleteTask", ...args),
  hiveInbox: (...args) => ipcRenderer.invoke("hive:inbox", ...args),
  hiveLog: (...args) => ipcRenderer.invoke("hive:log", ...args),
  hiveMemory: (...args) => ipcRenderer.invoke("hive:memory", ...args),
  hiveMessages: (...args) => ipcRenderer.invoke("hive:messages", ...args),
  hivePatchAgentRole: (...args) => ipcRenderer.invoke("hive:patchAgentRole", ...args),
  hivePatchTask: (...args) => ipcRenderer.invoke("hive:patchTask", ...args),
  hiveRegistry: (...args) => ipcRenderer.invoke("hive:registry", ...args),
  hiveRenameAgent: (...args) => ipcRenderer.invoke("hive:renameAgent", ...args),
  hiveSend: (...args) => ipcRenderer.invoke("hive:send", ...args),
  hiveSetAgentHold: (...args) => ipcRenderer.invoke("hive:setAgentHold", ...args),
  hiveSetArchived: (...args) => ipcRenderer.invoke("hive:setArchived", ...args),
  hiveTasks: (...args) => ipcRenderer.invoke("hive:tasks", ...args),
  importHireFiles: (...args) => ipcRenderer.invoke("hire:openFile", ...args),
  integrationsList: (...args) => ipcRenderer.invoke("integrations:list", ...args),
  integrationsRemove: (...args) => ipcRenderer.invoke("integrations:remove", ...args),
  integrationsSetSecret: (...args) => ipcRenderer.invoke("integrations:setSecret", ...args),
  integrationsTemplates: (...args) => ipcRenderer.invoke("integrations:templates", ...args),
  integrationsTest: (...args) => ipcRenderer.invoke("integrations:test", ...args),
  integrationsUpsert: (...args) => ipcRenderer.invoke("integrations:upsert", ...args),
  kgAddFiles: (...args) => ipcRenderer.invoke("kg:addFiles", ...args),
  kgGet: (...args) => ipcRenderer.invoke("kg:get", ...args),
  kgIngestFiles: (...args) => ipcRenderer.invoke("kg:ingestFiles", ...args),
  kgList: (...args) => ipcRenderer.invoke("kg:list", ...args),
  kgRemove: (...args) => ipcRenderer.invoke("kg:remove", ...args),
  kgSearch: (...args) => ipcRenderer.invoke("kg:search", ...args),
  kgStatus: (...args) => ipcRenderer.invoke("kg:status", ...args),
  killPty: (...args) => ipcRenderer.invoke("pty:kill", ...args),
  listDir: (...args) => ipcRenderer.invoke("fs:listDir", ...args),
  listMissions: (...args) => ipcRenderer.invoke("missions:list", ...args),
  listPtys: (...args) => ipcRenderer.invoke("pty:list", ...args),
  listTriggerHistory: (...args) => ipcRenderer.invoke("triggerHistory:list", ...args),
  listWebhooks: (...args) => ipcRenderer.invoke("webhooks:list", ...args),
  listWorkers: (...args) => ipcRenderer.invoke("workers:list", ...args),
  memoryStatus: (...args) => ipcRenderer.invoke("hive:memoryStatus", ...args),
  memoryWakeUp: (...args) => ipcRenderer.invoke("hive:memoryWakeUp", ...args),
  mineNow: (...args) => ipcRenderer.invoke("hive:mineNow", ...args),
  newFloor: (...args) => ipcRenderer.invoke("window:newFloor", ...args),
  onApprovalRequest: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("control:approvalRequest", l); return () => ipcRenderer.removeListener("control:approvalRequest", l); },
  onAutoCompact: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("mission:autoCompact", l); return () => ipcRenderer.removeListener("mission:autoCompact", l); },
  onBreakerState: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("control:breakerState", l); return () => ipcRenderer.removeListener("control:breakerState", l); },
  onCloseRequested: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("app:closeRequested", l); return () => ipcRenderer.removeListener("app:closeRequested", l); },
  onClosingTime: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("app:closingTime", l); return () => ipcRenderer.removeListener("app:closingTime", l); },
  onConfigChanged: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("config:changed", l); return () => ipcRenderer.removeListener("config:changed", l); },
  onContextTrigger: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("trigger:context", l); return () => ipcRenderer.removeListener("trigger:context", l); },
  onHireError: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hire:error", l); return () => ipcRenderer.removeListener("hire:error", l); },
  onHireImport: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hire:import", l); return () => ipcRenderer.removeListener("hire:import", l); },
  onHiveAgentArchived: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:agentArchived", l); return () => ipcRenderer.removeListener("hive:agentArchived", l); },
  onHiveAgentSpawned: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:agentSpawned", l); return () => ipcRenderer.removeListener("hive:agentSpawned", l); },
  onHiveContextUpdate: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:contextUpdate", l); return () => ipcRenderer.removeListener("hive:contextUpdate", l); },
  onHiveEnqueue: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:enqueueToAgent", l); return () => ipcRenderer.removeListener("hive:enqueueToAgent", l); },
  onHiveHookEvent: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:hookEvent", l); return () => ipcRenderer.removeListener("hive:hookEvent", l); },
  onHiveMessage: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:message", l); return () => ipcRenderer.removeListener("hive:message", l); },
  onHiveTerminalHandoff: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("hive:terminalHandoff", l); return () => ipcRenderer.removeListener("hive:terminalHandoff", l); },
  onMissionsUpdated: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("missions:updated", l); return () => ipcRenderer.removeListener("missions:updated", l); },
  onPowerResume: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("power:resume", l); return () => ipcRenderer.removeListener("power:resume", l); },
  onRealtimeCompletion: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("realtime:completion", l); return () => ipcRenderer.removeListener("realtime:completion", l); },
  onRealtimeEnqueue: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("realtime:enqueue", l); return () => ipcRenderer.removeListener("realtime:enqueue", l); },
  onRealtimeFloorDelta: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("realtime:floorDelta", l); return () => ipcRenderer.removeListener("realtime:floorDelta", l); },
  onSlackMessage: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("slack:incomingMessage", l); return () => ipcRenderer.removeListener("slack:incomingMessage", l); },
  onTelemetryEvent: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("telemetry:event", l); return () => ipcRenderer.removeListener("telemetry:event", l); },
  onTriggerHistoryUpdated: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("triggerHistory:updated", l); return () => ipcRenderer.removeListener("triggerHistory:updated", l); },
  onUpdateStatus: (cb) => { const l = (_e, ...rest) => cb(...rest); ipcRenderer.on("update:status", l); return () => ipcRenderer.removeListener("update:status", l); },
  openExternal: (...args) => ipcRenderer.invoke("app:openExternal", ...args),
  openTerminalAt: (...args) => ipcRenderer.invoke("terminal:openAtFolder", ...args),
  providerKeyClear: (...args) => ipcRenderer.invoke("providerKey:clear", ...args),
  providerKeyHas: (...args) => ipcRenderer.invoke("providerKey:has", ...args),
  providerKeySet: (...args) => ipcRenderer.invoke("providerKey:set", ...args),
  readBinary: (...args) => ipcRenderer.invoke("fs:readBinary", ...args),
  readClipboard: (...args) => ipcRenderer.invoke("app:readClipboard", ...args),
  readClipboardSync: (...args) => ipcRenderer.sendSync("app:readClipboardSync", ...args),
  readFile: (...args) => ipcRenderer.invoke("fs:readFile", ...args),
  realtimeAction: (...args) => ipcRenderer.invoke("realtime:action", ...args),
  realtimeActionCancel: (...args) => ipcRenderer.invoke("realtime:action:cancel", ...args),
  realtimeActionConfirm: (...args) => ipcRenderer.invoke("realtime:action:confirm", ...args),
  realtimeDrainCompletions: (...args) => ipcRenderer.invoke("realtime:drainCompletions", ...args),
  realtimeHasOpenAiKey: (...args) => ipcRenderer.invoke("realtime:hasKey", ...args),
  realtimeMintToken: (...args) => ipcRenderer.invoke("realtime:mintToken", ...args),
  realtimeSetSessionLive: (...args) => ipcRenderer.invoke("realtime:setSessionLive", ...args),
  realtimeWaitFor: (...args) => ipcRenderer.invoke("realtime:waitFor", ...args),
  redrawPty: (...args) => ipcRenderer.invoke("pty:redraw", ...args),
  reflectNow: (...args) => ipcRenderer.invoke("memory:reflectNow", ...args),
  resetAll: (...args) => ipcRenderer.invoke("app:resetAll", ...args),
  resizePty: (...args) => ipcRenderer.invoke("pty:resize", ...args),
  resolveSessionCwd: (...args) => ipcRenderer.invoke("session:resolveCwd", ...args),
  revealPath: (...args) => ipcRenderer.invoke("fs:revealPath", ...args),
  rosterReadSync: (...args) => ipcRenderer.sendSync("roster:readSync", ...args),
  rosterWrite: (...args) => ipcRenderer.invoke("roster:write", ...args),
  saveClipboardImage: (...args) => ipcRenderer.invoke("clipboard:saveImage", ...args),
  saveMissions: (...args) => ipcRenderer.invoke("missions:save", ...args),
  saveWebhooks: (...args) => ipcRenderer.invoke("webhooks:save", ...args),
  searchMemory: (...args) => ipcRenderer.invoke("hive:searchMemory", ...args),
  setAgentTokenCap: (...args) => ipcRenderer.invoke("config:setAgentTokenCap", ...args),
  setBreakerState: (...args) => ipcRenderer.invoke("control:setBreakerState", ...args),
  setContextTrigger: (...args) => ipcRenderer.invoke("triggers:setContext", ...args),
  setLoginItem: (...args) => ipcRenderer.invoke("app:setLoginItem", ...args),
  setNotifications: (...args) => ipcRenderer.invoke("app:setNotifications", ...args),
  setOrgTrigger: (...args) => ipcRenderer.invoke("org:setTrigger", ...args),
  skillsCatalog: (...args) => ipcRenderer.invoke("skills:catalog", ...args),
  skillsInstall: (...args) => ipcRenderer.invoke("skills:install", ...args),
  skillsLocal: (...args) => ipcRenderer.invoke("skills:local", ...args),
  skillsReveal: (...args) => ipcRenderer.invoke("skills:reveal", ...args),
  skillsUninstall: (...args) => ipcRenderer.invoke("skills:uninstall", ...args),
  slackReply: (...args) => ipcRenderer.invoke("slack:reply", ...args),
  slackReplyScriptPath: (...args) => ipcRenderer.invoke("slack:replyScriptPath", ...args),
  slackSetConfig: (...args) => ipcRenderer.invoke("slack:setConfig", ...args),
  slackStart: (...args) => ipcRenderer.invoke("slack:start", ...args),
  slackStatus: (...args) => ipcRenderer.invoke("slack:status", ...args),
  slackStop: (...args) => ipcRenderer.invoke("slack:stop", ...args),
  spawnPty: (...args) => ipcRenderer.invoke("pty:spawn", ...args),
  startClosingTime: (...args) => ipcRenderer.invoke("app:startClosingTime", ...args),
  statAbs: (...args) => ipcRenderer.invoke("fs:statAbs", ...args),
  stopWorker: (...args) => ipcRenderer.invoke("workers:stop", ...args),
  telemetrySnapshot: (...args) => ipcRenderer.invoke("telemetry:snapshot", ...args),
  telemetrySpans: (...args) => ipcRenderer.invoke("telemetry:spans", ...args),
  telemetryUsage: (...args) => ipcRenderer.invoke("telemetry:usage", ...args),
  textSearch: (...args) => ipcRenderer.invoke("hive:textSearch", ...args),
  toolsStatus: (...args) => ipcRenderer.invoke("tools:status", ...args),
  trackMessageSent: (...args) => ipcRenderer.invoke("analytics:messageSent", ...args),
  updateCheckNow: (...args) => ipcRenderer.invoke("update:checkNow", ...args),
  updateConfig: (...args) => ipcRenderer.invoke("config:update", ...args),
  updateCurrent: (...args) => ipcRenderer.invoke("update:current", ...args),
  updateDownload: (...args) => ipcRenderer.invoke("update:download", ...args),
  updateOpenRelease: (...args) => ipcRenderer.invoke("update:openRelease", ...args),
  updateRestartAndInstall: (...args) => ipcRenderer.invoke("update:restartAndInstall", ...args),
  updateSimulate: (...args) => ipcRenderer.invoke("update:simulate", ...args),
  webhookGenerateSecret: (...args) => ipcRenderer.invoke("webhook:generateSecret", ...args),
  webhookSetConfig: (...args) => ipcRenderer.invoke("webhook:setConfig", ...args),
  webhookStart: (...args) => ipcRenderer.invoke("webhook:start", ...args),
  webhookStatus: (...args) => ipcRenderer.invoke("webhook:status", ...args),
  webhookStop: (...args) => ipcRenderer.invoke("webhook:stop", ...args),
  webhooksStatus: (...args) => ipcRenderer.invoke("webhooks:status", ...args),
  writeFile: (...args) => ipcRenderer.invoke("fs:writeFile", ...args),
  writePty: (...args) => ipcRenderer.invoke("pty:write", ...args),
};

const cthBridge = {
  onPtyData: (id, cb) => {
    const ch = `pty:data:${id}`;
    const l = (_e, data) => cb(data);
    ipcRenderer.on(ch, l);
    return () => ipcRenderer.removeListener(ch, l);
  },
  onPtyExit: (id, cb) => {
    const ch = `pty:exit:${id}`;
    const l = (_e, info) => cb(info);
    ipcRenderer.on(ch, l);
    return () => ipcRenderer.removeListener(ch, l);
  },
  onPtyRelaunch: (id, cb) => {
    const ch = `pty:relaunch:${id}`;
    const l = () => cb();
    ipcRenderer.on(ch, l);
    return () => ipcRenderer.removeListener(ch, l);
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  platform: process.platform,
  arch: process.arch,
  version: "0.4.6-cth",
};

for (const [name, fn] of Object.entries(CTH_CHANNELS)) {
  if (!cthBridge[name]) cthBridge[name] = fn;
}

contextBridge.exposeInMainWorld("cth", cthBridge);


const api = {
  // Pet window: telemetry + positioning
  getDeviceStatus: () => ipcRenderer.invoke("get-device-status"),
  getScreenWorkArea: () => ipcRenderer.invoke("get-screen-work-area"),
  getPetPosition: () => ipcRenderer.invoke("get-pet-position"),
  setPetPosition: (x, y) => ipcRenderer.send("set-pet-position", { x, y }),
  movePetWindow: (deltaX, deltaY) =>
    ipcRenderer.send("move-pet-window", { deltaX, deltaY }),

  // Console window controls + navigation
  toggleConsole: () => ipcRenderer.send("toggle-console"),
  openConsoleAt: (route) => ipcRenderer.send("open-console-at", { route }),
  windowMinimize: () => ipcRenderer.send("window-minimize"),
  windowMaximize: () => ipcRenderer.send("window-maximize"),
  windowClose: () => ipcRenderer.send("window-close"),

  // RADAS status (Phase 3: live worker/approval/queue telemetry).
  // Returns aggregate counts only — never tokens or payloads.
  getRadasStatus: () => ipcRenderer.invoke("get-radas-status"),

  // Auth presence (Phase 2: shared identity with the CLI credential store).
  // Boolean/username only — tokens never cross the bridge.
  getAuthStatus: () => ipcRenderer.invoke("get-auth-status"),
};

contextBridge.exposeInMainWorld("radasDesktop", api);
