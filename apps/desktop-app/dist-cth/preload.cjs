"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// cth/preload/index.ts
var index_exports = {};
module.exports = __toCommonJS(index_exports);
var import_electron = require("electron");
var api = {
  version: "1.0.0",
  // ─── Analytics ───────────────────────────────────────────────────────────
  /** Count ONE human-sent message (TELEMETRY.md → `message_sent`). Carries a
   *  surface name and nothing else — no text, no length, no agent id — and main
   *  accepts only 'terminal' and 'composer' here (steer and hive are counted in
   *  main, at their own handlers). Never awaited by callers and never allowed to
   *  throw: a telemetry hiccup must not break sending a message. */
  trackMessageSent: (surface) => import_electron.ipcRenderer.invoke("analytics:messageSent", surface).then(() => void 0, () => void 0),
  // ─── PTY ─────────────────────────────────────────────────────────────────
  /** `cwd` in the result is the TILDE-EXPANDED absolute path main actually spawned
   *  into — the renderer stores that, not the raw `~/…` the user typed. */
  spawnPty: (opts) => import_electron.ipcRenderer.invoke("pty:spawn", opts),
  writePty: (id, data) => import_electron.ipcRenderer.invoke("pty:write", id, data),
  resizePty: (id, cols, rows) => import_electron.ipcRenderer.invoke("pty:resize", id, cols, rows),
  redrawPty: (id) => import_electron.ipcRenderer.invoke("pty:redraw", id),
  killPty: (id) => import_electron.ipcRenderer.invoke("pty:kill", id),
  listPtys: () => import_electron.ipcRenderer.invoke("pty:list"),
  /** Resolve a Claude session id to the cwd it originally ran in (Add Agent
   *  resume auto-fill), or null if the id is invalid/unknown. */
  resolveSessionCwd: (sessionId) => import_electron.ipcRenderer.invoke("session:resolveCwd", sessionId),
  onPtyData: (id, cb) => {
    const channel = `pty:data:${id}`;
    const listener = (_e, data) => cb(data);
    import_electron.ipcRenderer.on(channel, listener);
    return () => import_electron.ipcRenderer.removeListener(channel, listener);
  },
  onPtyExit: (id, cb) => {
    const channel = `pty:exit:${id}`;
    const listener = (_e, info) => cb(info);
    import_electron.ipcRenderer.on(channel, listener);
    return () => import_electron.ipcRenderer.removeListener(channel, listener);
  },
  /** Fires when an agent is auto restart-and-continued into this SAME pty after a
   *  first-time engine-CLI install. The terminal should re-arm in place (clear the
   *  "process exited" line + re-enable input) so the relaunched CLI paints clean. */
  onPtyRelaunch: (id, cb) => {
    const channel = `pty:relaunch:${id}`;
    const listener = () => cb();
    import_electron.ipcRenderer.on(channel, listener);
    return () => import_electron.ipcRenderer.removeListener(channel, listener);
  },
  // ─── Dialog ──────────────────────────────────────────────────────────────
  chooseFolder: () => import_electron.ipcRenderer.invoke("dialog:chooseFolder"),
  // ─── Terminal.app ────────────────────────────────────────────────────────
  openTerminalAt: (cwd) => import_electron.ipcRenderer.invoke("terminal:openAtFolder", cwd),
  // ─── Clipboard ─────────────────────────────────────────────────────────────
  copyToClipboard: (text) => import_electron.ipcRenderer.invoke("app:copyToClipboard", text),
  /** Read the system clipboard as plain text ('' when empty/unreadable). */
  readClipboard: () => import_electron.ipcRenderer.invoke("app:readClipboard"),
  /** Clipboard text, read SYNCHRONOUSLY. Only for the terminal's paste shortcut,
   *  where an async read loses a race against dictation tools that restore the
   *  previous clipboard right after sending the paste key.
   *
   *  TRADEOFF, stated plainly because sendSync blocks the renderer until main
   *  answers: this app has a history of main-thread stalls (iCloud-evicted files
   *  wedging a spawnSync git call), and during such a stall this call freezes the
   *  paste keystroke rather than merely delaying it. Accepted because a clipboard
   *  read is a memory lookup with no I/O, and because the async alternative is
   *  measurably WRONG — it pastes the user's previous clipboard. Do not reach for
   *  sendSync elsewhere on this reasoning; it is justified by the race, not by
   *  convenience. */
  readClipboardSync: () => {
    try {
      return import_electron.ipcRenderer.sendSync("app:readClipboardSync") ?? "";
    } catch {
      return "";
    }
  },
  // ─── Config ──────────────────────────────────────────────────────────────
  getConfig: () => import_electron.ipcRenderer.invoke("config:get"),
  updateConfig: (patch) => import_electron.ipcRenderer.invoke("config:update", patch),
  /** Set or clear one per-agent token ceiling against main's latest config. */
  setAgentTokenCap: (agentId, tokenCap) => import_electron.ipcRenderer.invoke("config:setAgentTokenCap", agentId, tokenCap),
  ensureHarnessHome: (path) => import_electron.ipcRenderer.invoke("config:ensureHome", path),
  /** Change the harness home folder. 'move' copies the existing hive + palace
   *  into the new folder (old kept as a safety net); 'fresh' just re-points and
   *  bootstraps an empty home. On success the app relaunches (never resolves);
   *  on failure (e.g. copy error) returns { ok: false, error }. */
  changeHome: (newHome, mode) => import_electron.ipcRenderer.invoke("config:changeHome", { newHome, mode }),
  // ─── Filesystem (sandboxed to cwd) ───────────────────────────────────────
  listDir: (root, rel) => import_electron.ipcRenderer.invoke("fs:listDir", root, rel),
  readFile: (root, rel) => import_electron.ipcRenderer.invoke("fs:readFile", root, rel),
  /** Raw bytes for files `readFile` refuses (images). The renderer has no way to
   *  load them off disk — the CSP allows no `file:` source and no file protocol
   *  is registered — so images travel as bytes and become a `blob:` URL in the
   *  renderer, which `img-src` already permits. Root-confined and size-capped in
   *  the main process; `mime` is derived from the extension. */
  readBinary: (root, rel) => import_electron.ipcRenderer.invoke("fs:readBinary", root, rel),
  writeFile: (root, rel, content) => import_electron.ipcRenderer.invoke("fs:writeFile", root, rel, content),
  /** v0.3.4: existence check for an absolute path (expands ~) — backs the
   *  terminal ⌘-click markdown flow. Metadata only, never contents. */
  statAbs: (p) => import_electron.ipcRenderer.invoke("fs:statAbs", p),
  /** Show a path in the OS file browser (Finder / Explorer / the Linux default).
   *  Backs ⌘-click on a terminal path we have no viewer for. Reveals only — main
   *  never launches a file's default application, because the path came from
   *  agent output. */
  revealPath: (p) => import_electron.ipcRenderer.invoke("fs:revealPath", p),
  // ─── Git ─────────────────────────────────────────────────────────────────
  gitIsRepo: (cwd) => import_electron.ipcRenderer.invoke("git:isRepo", cwd),
  /** Absolute path of the MAIN working tree `cwd` belongs to — a linked worktree
   *  resolves to the original repo, not to itself. null when not a git repo. */
  gitMainRepo: (cwd) => import_electron.ipcRenderer.invoke("git:mainRepo", cwd),
  gitBranch: (cwd) => import_electron.ipcRenderer.invoke("git:branch", cwd),
  gitStatus: (cwd) => import_electron.ipcRenderer.invoke("git:status", cwd),
  gitLog: (cwd, n) => import_electron.ipcRenderer.invoke("git:log", cwd, n ?? 50),
  gitBranches: (cwd) => import_electron.ipcRenderer.invoke("git:branches", cwd),
  gitAheadBehind: (cwd) => import_electron.ipcRenderer.invoke("git:aheadBehind", cwd),
  /** Diff one repo-root-relative file: its HEAD content vs its working-tree content.
   *  Path-validated main-side against `cwd`; the renderer only ever gets the two
   *  text sides. Backs the IDE's git-diff (Monaco DiffEditor) view. */
  gitDiff: (cwd, relPath) => import_electron.ipcRenderer.invoke("git:diff", cwd, relPath),
  // ── v0.3.4: history / compare / checkout (git visualization) ──
  gitLogGraph: (cwd, n, skip) => import_electron.ipcRenderer.invoke("git:logGraph", cwd, n, skip ?? 0),
  gitCommitFiles: (cwd, sha) => import_electron.ipcRenderer.invoke("git:commitFiles", cwd, sha),
  gitShowFile: (cwd, rev, relPath) => import_electron.ipcRenderer.invoke("git:showFile", cwd, rev, relPath),
  gitCompareRefs: (cwd, base, head, mode) => import_electron.ipcRenderer.invoke("git:compareRefs", cwd, base, head, mode ?? "three"),
  gitWorktrees: (cwd) => import_electron.ipcRenderer.invoke("git:worktrees", cwd),
  gitCheckout: (cwd, ref, detach) => import_electron.ipcRenderer.invoke("git:checkout", cwd, ref, detach === true),
  // ─── Hive (multi-agent coordination) ─────────────────────────────────────
  hiveRegistry: () => import_electron.ipcRenderer.invoke("hive:registry"),
  /** Persist a hire/job role to hive registry.json + identity.md (no respawn). */
  hivePatchAgentRole: (id, role) => import_electron.ipcRenderer.invoke("hive:patchAgentRole", id, role),
  /** Rename an agent's display name. Its id, hive directory, and PTY are unchanged. */
  hiveRenameAgent: (id, name) => import_electron.ipcRenderer.invoke("hive:renameAgent", id, name),
  /** Put an agent on hold (the human has them 1:1) or take it off. Held agents
   *  keep running; Michael is told to stop routing work to them. */
  hiveSetAgentHold: (id, hold) => import_electron.ipcRenderer.invoke("hive:setAgentHold", id, hold),
  hiveBoard: () => import_electron.ipcRenderer.invoke("hive:board"),
  hiveTasks: () => import_electron.ipcRenderer.invoke("hive:tasks"),
  hiveLog: (n) => import_electron.ipcRenderer.invoke("hive:log", n ?? 200),
  hiveMemory: (id) => import_electron.ipcRenderer.invoke("hive:memory", id),
  hiveInbox: (id) => import_electron.ipcRenderer.invoke("hive:inbox", id),
  /** Voice read-layer: recent message CONTENT (inbox/outbox bodies), REDACTED in
   *  main. Pass { id } for one message, { agentId } to scope to one mailbox, or
   *  {} for the whole floor. Backs Realtime Michael's get_messages. The renderer
   *  never sees a raw body or a secret — stripping happens main-side. */
  hiveMessages: (opts) => import_electron.ipcRenderer.invoke("hive:messages", opts ?? {}),
  /** Consolidated per-agent directory (registry + telemetry + context), incl.
   *  archived agents. Backs Realtime Michael's get_agent_detail / list_agents. */
  hiveAgentDirectory: () => import_electron.ipcRenderer.invoke("hive:agentDirectory"),
  // ─── Ephemeral workers (P4 — Slack-triggered isolated workers) ───────────
  /** Live ephemeral workers + worktrees preserved awaiting integration/GC. */
  listWorkers: () => import_electron.ipcRenderer.invoke("workers:list"),
  /** Manually stop a live ephemeral worker (safety-gated teardown; work preserved). */
  stopWorker: (workerId) => import_electron.ipcRenderer.invoke("workers:stop", workerId),
  // ─── Semantic memory (MemPalace CLI) ─────────────────────────────────────
  memoryStatus: () => import_electron.ipcRenderer.invoke("hive:memoryStatus"),
  /** Which external tools (uv, mempalace, git, each agent engine) are actually
   *  present on this machine, with a platform-resolved install command each. */
  toolsStatus: () => import_electron.ipcRenderer.invoke("tools:status"),
  /** Settings hero payload — plan + sponsor, fetched from the repo and cached. */
  heroPayload: (force) => import_electron.ipcRenderer.invoke("hero:payload", force),
  /** Skills already installed for the coding agents on this machine. */
  skillsLocal: (cwd) => import_electron.ipcRenderer.invoke("skills:local", cwd),
  /** The browsable skills catalog (cached; `force` re-fetches). */
  skillsCatalog: (force) => import_electron.ipcRenderer.invoke("skills:catalog", force),
  /** Install a catalog skill into ~/.claude/skills. `unsupported` distinguishes
   *  "there is no downloadable source" from "the download failed". */
  skillsInstall: (url, name) => import_electron.ipcRenderer.invoke("skills:install", url, name),
  /** Delete an installed skill. Main refuses any path outside a skills root. */
  skillsUninstall: (path) => import_electron.ipcRenderer.invoke("skills:uninstall", path),
  /** Show a skill's folder in the OS file manager. */
  skillsReveal: (path) => import_electron.ipcRenderer.invoke("skills:reveal", path),
  searchMemory: (query, wing) => import_electron.ipcRenderer.invoke("hive:searchMemory", query, wing),
  memoryWakeUp: (wing) => import_electron.ipcRenderer.invoke("hive:memoryWakeUp", wing),
  mineNow: () => import_electron.ipcRenderer.invoke("hive:mineNow"),
  /** Condense agent memory.md files (the janitor's missing half). With an id,
   *  condense that agent on demand; without, run a full threshold scan. Returns
   *  the per-agent outcomes ({ id, condensed, reason, oldBytes?, newBytes? }). */
  reflectNow: (id) => import_electron.ipcRenderer.invoke("memory:reflectNow", id),
  // ─── Enterprise Knowledge Graph (multimodal context for agents) ───────────
  kgStatus: () => import_electron.ipcRenderer.invoke("kg:status"),
  kgList: () => import_electron.ipcRenderer.invoke("kg:list"),
  kgSearch: (query, limit) => import_electron.ipcRenderer.invoke("kg:search", query, limit),
  kgGet: (id) => import_electron.ipcRenderer.invoke("kg:get", id),
  kgRemove: (id) => import_electron.ipcRenderer.invoke("kg:remove", id),
  /** Open an OS file picker and ingest the chosen artifacts in one round-trip. */
  kgAddFiles: () => import_electron.ipcRenderer.invoke("kg:addFiles"),
  /** Ingest explicit file paths (e.g. drag-and-drop). */
  kgIngestFiles: (paths, tags) => import_electron.ipcRenderer.invoke("kg:ingestFiles", { paths, tags }),
  // ─── Composer attachments (images + files, sent to agents by PATH) ─────────
  /** Open an OS picker for images/files; returns chosen absolute paths + names. */
  attachFiles: () => import_electron.ipcRenderer.invoke("dialog:attachFiles"),
  /** Resolve a dropped File's absolute path (Electron 32 removed File.path). */
  pathForFile: (file) => import_electron.webUtils.getPathForFile(file),
  /** Write the current clipboard image to a temp PNG and return its path (paste-to-attach). */
  saveClipboardImage: () => import_electron.ipcRenderer.invoke("clipboard:saveImage"),
  // ─── Command history (SQLite — every prompt submitted to an agent) ─────────
  /** Record one submitted prompt. Fire-and-forget from the prompt-detection hook. */
  historyAdd: (entry) => import_electron.ipcRenderer.invoke("history:add", entry),
  /** Most-recent-first history, optionally scoped to one agent. */
  historyList: (agentId, limit) => import_electron.ipcRenderer.invoke("history:list", agentId, limit),
  /** Substring search over prompt text, most-recent-first. */
  historySearch: (query, limit) => import_electron.ipcRenderer.invoke("history:search", query, limit),
  hiveSend: (msg, from) => import_electron.ipcRenderer.invoke("hive:send", msg, from),
  onHiveHookEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:hookEvent", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:hookEvent", listener);
  },
  /** Push-based context accounting from the status line: live tokens + the
   *  session's EXACT context-window size. Same pattern as onHiveHookEvent. */
  onHiveContextUpdate: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:contextUpdate", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:contextUpdate", listener);
  },
  onHiveMessage: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:message", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:message", listener);
  },
  /** Register a listener for hive tasks routed to non-Claude agents (e.g.
   *  Codex). Main emits this instead of bouncing; the renderer enqueues the
   *  raw text so the drain effect types it into the agent's REPL when idle. */
  onHiveEnqueue: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:enqueueToAgent", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:enqueueToAgent", listener);
  },
  /** A MAIN-initiated agent spawn (e.g. a voice hire via rt-5) — the renderer adds
   *  the floor card from this descriptor since it didn't initiate the hire itself. */
  onHiveAgentSpawned: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:agentSpawned", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:agentSpawned", listener);
  },
  /** A MAIN-initiated agent kill/archive (e.g. a voice kill via rt-5) — the renderer
   *  archives the floor card since it didn't initiate the kill itself. */
  onHiveAgentArchived: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:agentArchived", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:agentArchived", listener);
  },
  /** Register a listener for terminal work-order handoffs (#53) — hive mail to a
   *  hookless provider that can't drain an inbox; the renderer types it into the
   *  agent's REPL as a work order. */
  onHiveTerminalHandoff: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("hive:terminalHandoff", listener);
    return () => import_electron.ipcRenderer.removeListener("hive:terminalHandoff", listener);
  },
  // ─── Shareable hires (deep link / file import) ────────────────────────────
  /** Fired when a validated hire manifest arrives via the munderdifflin://
   *  deep link. The renderer opens the Add-Agent modal pre-filled — import
   *  never spawns anything by itself. */
  onHireImport: (cb) => {
    const listener = (_e, manifest) => cb(manifest);
    import_electron.ipcRenderer.on("hire:import", listener);
    return () => import_electron.ipcRenderer.removeListener("hire:import", listener);
  },
  /** Fired when a deep-linked manifest failed validation/fetch. */
  onHireError: (cb) => {
    const listener = (_e, info) => cb(info);
    import_electron.ipcRenderer.on("hire:error", listener);
    return () => import_electron.ipcRenderer.removeListener("hire:error", listener);
  },
  /** Signal readiness and pull any queued deep-linked manifests (cold-start
   *  links, links that arrived during load). Resolves the queued list. */
  drainPendingHires: () => import_electron.ipcRenderer.invoke("hire:drainPending"),
  /** Open a multi-file picker and validate every selected hire manifest. */
  importHireFiles: () => import_electron.ipcRenderer.invoke("hire:openFile"),
  // ─── Config changes ──────────────────────────────────────────────────────
  /** Fired whenever a setting is saved, with the full updated config. */
  onConfigChanged: (cb) => {
    const listener = (_e, config) => cb(config);
    import_electron.ipcRenderer.on("config:changed", listener);
    return () => import_electron.ipcRenderer.removeListener("config:changed", listener);
  },
  // ─── Quit confirmation ───────────────────────────────────────────────────
  onCloseRequested: (cb) => {
    const listener = (_e, info) => cb(info);
    import_electron.ipcRenderer.on("app:closeRequested", listener);
    return () => import_electron.ipcRenderer.removeListener("app:closeRequested", listener);
  },
  confirmClose: () => import_electron.ipcRenderer.invoke("app:confirmClose"),
  cancelClose: () => import_electron.ipcRenderer.invoke("app:cancelClose"),
  // ─── Power / wake (auto-revive wedged PTYs after sleep/lock) ────────────────
  /** Subscribe to the main-process power-resume signal; returns an unsubscribe
   *  fn. The main process catches up after a sleep/unlock and reports the PTY
   *  ids that wedged across it in `dead` — the renderer respawns ONLY those
   *  (empty `dead[]` = no-op). Same main→renderer push pattern as onClosingTime. */
  onPowerResume: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("power:resume", listener);
    return () => import_electron.ipcRenderer.removeListener("power:resume", listener);
  },
  // ─── Multi-window floors ───────────────────────────────────────────────────
  /** Open a new floor (independent office window). No-op when the multiWindow
   *  flag is off. Resolves { ok } indicating whether a window opened. */
  newFloor: () => import_electron.ipcRenderer.invoke("window:newFloor"),
  // ─── Closing time (graceful shutdown via the hive) ─────────────────────────
  /** Start the closing-time protocol: the god broadcasts shutdown, every worker
   *  saves its memory and ACKs, the god concludes — then the app quits itself.
   *  Resolves with ok:false (+ error) when no god agent is running. */
  startClosingTime: () => import_electron.ipcRenderer.invoke("app:startClosingTime"),
  /** Abort an in-progress closing time and tell the floor to resume work. */
  cancelClosingTime: () => import_electron.ipcRenderer.invoke("app:cancelClosingTime"),
  /** Progress events for the quit dialog: started → progress (ACK counts) →
   *  complete (the app tears down moments later) | timeout | cancelled. */
  onClosingTime: (cb) => {
    const listener = (_e, ev) => cb(ev);
    import_electron.ipcRenderer.on("app:closingTime", listener);
    return () => import_electron.ipcRenderer.removeListener("app:closingTime", listener);
  },
  // ─── Reset ─────────────────────────────────────────────────────────────────
  /** Wipe all hive data + the memory palace, reset config, and relaunch the app
   *  into onboarding. The process exits, so this promise never resolves. */
  resetAll: () => import_electron.ipcRenderer.invoke("app:resetAll"),
  // ─── Token telemetry (real usage + est. cost from CC transcripts) ──────────
  /** Sum input/output/cache tokens + estimated USD cost for an agent from its
   *  Claude Code transcripts (reconciler/fallback). Returns null for an invalid cwd. */
  agentUsage: (cwd) => import_electron.ipcRenderer.invoke("hive:agentUsage", cwd),
  /** Current context size (tokens) of an agent's live session, read from the
   *  last assistant message of its transcript. Null until the agent's hooks
   *  have fired at least once (the transcript path is learned from them). */
  agentContext: (agentId) => import_electron.ipcRenderer.invoke("hive:agentContext", agentId),
  // ─── Live telemetry (OTel collector — the usage-provider seam + spans) ──────
  /** Live cumulative usage for an agent (OTel-preferred, transcript fallback). */
  telemetryUsage: (agentId) => import_electron.ipcRenderer.invoke("telemetry:usage", agentId),
  /** Recent tool spans for an agent's waterfall (#7B.2). */
  telemetrySpans: (agentId) => import_electron.ipcRenderer.invoke("telemetry:spans", agentId),
  /** Cold-start backfill of all agents' usage + recent spans. */
  telemetrySnapshot: () => import_electron.ipcRenderer.invoke("telemetry:snapshot"),
  /** Subscribe to live telemetry pushes; returns an unsubscribe fn. */
  onTelemetryEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("telemetry:event", listener);
    return () => import_electron.ipcRenderer.removeListener("telemetry:event", listener);
  },
  // ─── Circuit breaker (Lane A #6 state → avatars/meter) ──────────────────────
  /** Subscribe to breaker-state changes; returns an unsubscribe fn. */
  onBreakerState: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("control:breakerState", listener);
    return () => import_electron.ipcRenderer.removeListener("control:breakerState", listener);
  },
  /** Push a breaker state to the renderer (Lane A's policy / interim glue calls this). */
  setBreakerState: (state) => import_electron.ipcRenderer.invoke("control:setBreakerState", state),
  // ─── Operator control over agents (#7C.1–7C.3) ──────────────────────────────
  /** Pause/unpause an agent — paused → its tool calls are denied at PreToolUse. */
  controlPause: (agentId, on) => import_electron.ipcRenderer.invoke("control:pause", agentId, on),
  /** Pause/resume automatic inbox and queued-message delivery for one agent. */
  controlAutoDelivery: (agentId, paused) => import_electron.ipcRenderer.invoke("control:autoDelivery", agentId, paused),
  /** Clear pause + halt so the agent can run again. */
  controlResume: (agentId) => import_electron.ipcRenderer.invoke("control:resume", agentId),
  /** Gate/ungate a specific tool for an agent (denied at PreToolUse). */
  controlGateTool: (agentId, tool, on) => import_electron.ipcRenderer.invoke("control:gateTool", agentId, tool, on),
  /** Queue a steer note — injected as context on the agent's next hook (#7C.2). */
  controlSteer: (agentId, text) => import_electron.ipcRenderer.invoke("control:steer", agentId, text),
  /** Request a graceful stop at the next hook boundary (#7C.3). */
  controlHalt: (agentId) => import_electron.ipcRenderer.invoke("control:halt", agentId),
  /** Read an agent's current control snapshot. */
  controlSnapshot: (agentId) => import_electron.ipcRenderer.invoke("control:snapshot", agentId),
  /** Subscribe to gate/deny events (a tool was blocked); returns unsubscribe fn. */
  onApprovalRequest: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("control:approvalRequest", listener);
    return () => import_electron.ipcRenderer.removeListener("control:approvalRequest", listener);
  },
  // ─── Task kanban (hive/tasks.json) ───────────────────────────────────────
  /** Atomically append one card against the latest main-process ledger. */
  hiveAddTask: (task) => import_electron.ipcRenderer.invoke("hive:addTask", task),
  /** Atomically patch one named card without replacing unrelated cards/fields. */
  hivePatchTask: (id, patch) => import_electron.ipcRenderer.invoke("hive:patchTask", id, patch),
  /** Atomically remove one named card from the latest main-process ledger. */
  hiveDeleteTask: (id) => import_electron.ipcRenderer.invoke("hive:deleteTask", id),
  // ─── Scheduled missions (recurring auto-dispatch) ──────────────────────────
  listMissions: () => import_electron.ipcRenderer.invoke("missions:list"),
  saveMissions: (missions) => import_electron.ipcRenderer.invoke("missions:save", missions),
  /** Fires when the scheduler stamps a mission's lastFiredAt (a beat/dispatch),
   *  so the SCHEDULES panel can refresh "last fired" without a reload. */
  onMissionsUpdated: (cb) => {
    const listener = () => cb();
    import_electron.ipcRenderer.on("missions:updated", listener);
    return () => import_electron.ipcRenderer.removeListener("missions:updated", listener);
  },
  /** Fires when an autoCompact mission ticks — the renderer queues a /compact
   *  per agent (deduped) and delivers it when each agent is idle. */
  onAutoCompact: (cb) => {
    const listener = () => cb();
    import_electron.ipcRenderer.on("mission:autoCompact", listener);
    return () => import_electron.ipcRenderer.removeListener("mission:autoCompact", listener);
  },
  // ─── Full-text search across hive files (board, tasks, memory) ─────────────
  textSearch: (q) => import_electron.ipcRenderer.invoke("hive:textSearch", q),
  // ─── GitHub issue ingestion (gh CLI) ───────────────────────────────────────
  /** List up to 30 open issues in the repo at `cwd` via the `gh` CLI. Returns
   *  `{ ok: false, error }` if `gh` is missing/unauthenticated or `cwd` isn't a repo. */
  githubIssues: (cwd) => import_electron.ipcRenderer.invoke("github:issues", cwd),
  // ─── GitHub CI status watcher (gh CLI) ─────────────────────────────────────
  /** List up to 5 recent CI (GitHub Actions) runs in the repo at `cwd` via the
   *  `gh` CLI. Returns `{ ok: false, error }` if `gh` is missing/unauthenticated,
   *  `cwd` isn't a repo, or the repo has no Actions. */
  githubCIRuns: (cwd) => import_electron.ipcRenderer.invoke("github:ciRuns", cwd),
  // ─── Desktop notifications ───────────────────────────────────────────────────
  /** Toggle native desktop notifications for agent lifecycle events. */
  setNotifications: (v) => import_electron.ipcRenderer.invoke("app:setNotifications", v),
  // ─── Reliability / OS integration (onboarding permissions step) ──────────────
  /** Open a System Settings deep-link (or https URL) in the OS handler. Main
   *  restricts the scheme; the renderer just points at the pane. */
  openExternal: (url) => import_electron.ipcRenderer.invoke("app:openExternal", url),
  /** Toggle macOS "Open at Login". Resolves to the resulting state (no prompt). */
  setLoginItem: (enabled) => import_electron.ipcRenderer.invoke("app:setLoginItem", enabled),
  // ─── Agent lifecycle (archival) ─────────────────────────────────────────────
  /** Archive/unarchive a hive agent in the registry. Closing a terminal tab
   *  archives it automatically via pty:kill; this is the explicit primitive. */
  hiveSetArchived: (id, archived) => import_electron.ipcRenderer.invoke("hive:setArchived", id, archived),
  // ─── Slack integration (Slack message → Michael's queue) ─────────────────────
  /** Register a listener for inbound Slack messages; returns an unsubscribe fn.
   *  The message carries the thread coordinates needed to reply in-thread. */
  onSlackMessage: (cb) => {
    const listener = (_e, msg) => cb(msg);
    import_electron.ipcRenderer.on("slack:incomingMessage", listener);
    return () => import_electron.ipcRenderer.removeListener("slack:incomingMessage", listener);
  },
  /** Start the Slack webhook server; returns the public tunnel URL to paste into
   *  the Slack app's Event Subscriptions → Request URL. */
  slackStart: () => import_electron.ipcRenderer.invoke("slack:start"),
  /** Stop the Slack webhook server + tunnel. */
  slackStop: () => import_electron.ipcRenderer.invoke("slack:stop"),
  /** Current connection state + last Request URL (so Settings can hydrate the
   *  "Connected" badge and re-show the persisted tunnel URL on reopen). */
  slackStatus: () => import_electron.ipcRenderer.invoke("slack:status"),
  /** Post a reply into a Slack thread (the bot token stays in main). Used for the
   *  renderer's immediate "queued" ack. */
  slackReply: (m) => import_electron.ipcRenderer.invoke("slack:reply", m),
  /** Absolute path to the bundled reply helper, for the office worker's
   *  end-of-run "post your summary back to Slack" instruction. */
  slackReplyScriptPath: () => import_electron.ipcRenderer.invoke("slack:replyScriptPath"),
  /** Persist Slack settings (and stop the server if disabled / secret cleared). */
  slackSetConfig: (patch) => import_electron.ipcRenderer.invoke("slack:setConfig", patch),
  // ─── Generic webhook + status API (POST → work, GET → status) ────────────────
  /** Start the generic webhook server; returns the public endpoint URL callers
   *  POST to (secret-gated) and GET a token's status from. */
  webhookStart: () => import_electron.ipcRenderer.invoke("webhook:start"),
  /** Stop the generic webhook server + tunnel. */
  webhookStop: () => import_electron.ipcRenderer.invoke("webhook:stop"),
  /** Current state + last endpoint URL (so Settings can hydrate the badge/URL). */
  webhookStatus: () => import_electron.ipcRenderer.invoke("webhook:status"),
  /** Mint + persist a fresh secret and return it for the user to copy. */
  webhookGenerateSecret: () => import_electron.ipcRenderer.invoke("webhook:generateSecret"),
  /** Persist webhook settings (and stop the server if disabled / secret cleared). */
  webhookSetConfig: (patch) => import_electron.ipcRenderer.invoke("webhook:setConfig", patch),
  // ─── Triggers: context (auto-compact / auto-clear) ──────────────────────────
  /** The two context rules (cadence + pressure gate + message), deep-filled. */
  getContextTrigger: () => import_electron.ipcRenderer.invoke("triggers:getContext"),
  /** Persist both rules and RE-ARM main's timers; resolves to what was stored
   *  (main clamps the cadence/percentages, so the echo is authoritative). */
  setContextTrigger: (cfg) => import_electron.ipcRenderer.invoke("triggers:setContext", cfg),
  /** Fires when a context rule comes due. `rule` rides along because main owns
   *  only the CADENCE — the renderer applies the per-agent pressure gate and
   *  queues the command for each agent that qualifies. */
  onContextTrigger: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("trigger:context", listener);
    return () => import_electron.ipcRenderer.removeListener("trigger:context", listener);
  },
  // ─── Triggers: webhook endpoints (many endpoints, one server + tunnel) ──────
  /** Every configured endpoint, enabled or not. */
  listWebhooks: () => import_electron.ipcRenderer.invoke("webhooks:list"),
  /** Replace the whole list; main normalises each row (a blank secret keeps the
   *  stored one, an unknown mode keeps the stored one) and hot-swaps the running
   *  server's endpoints WITHOUT a restart, so no other caller's URL changes. */
  saveWebhooks: (list) => import_electron.ipcRenderer.invoke("webhooks:save", list),
  /** Revoke one endpoint; resolves to the remaining list. */
  deleteWebhook: (id) => import_electron.ipcRenderer.invoke("webhooks:delete", id),
  /** Mint a 256-bit secret for the operator to paste into their caller. Not
   *  persisted until the endpoint carrying it is saved. */
  generateWebhookSecret: () => import_electron.ipcRenderer.invoke("webhooks:generateSecret"),
  /** Server state, the tunnel root, and each endpoint's full public URL (`url` is
   *  '' until a tunnel has come up). */
  webhooksStatus: () => import_electron.ipcRenderer.invoke("webhooks:status"),
  // ─── Triggers: organisation (clone-node peer messaging) ─────────────────────
  /** PERSISTENCE ONLY — the peer transport does not exist yet, so setting this
   *  stores the key and mode and starts nothing. */
  getOrgTrigger: () => import_electron.ipcRenderer.invoke("org:getTrigger"),
  setOrgTrigger: (cfg) => import_electron.ipcRenderer.invoke("org:setTrigger", cfg),
  // ─── Triggers: history ledger + approval gate ───────────────────────────────
  /** The whole ledger, newest first (both directions, both sources). */
  listTriggerHistory: () => import_electron.ipcRenderer.invoke("triggerHistory:list"),
  /** Answer a held message. 'approved' RELEASES it to the hive (card + god
   *  request, the same path an auto-allowed message takes); 'rejected' only flips
   *  the verdict. Deciding an already-decided entry is a no-op, never a second
   *  dispatch. Resolves to the updated row, or null when the id is gone. */
  decideTriggerHistory: (arg) => import_electron.ipcRenderer.invoke("triggerHistory:decide", arg),
  /** Wipe the ledger, or just one source's half of it. */
  clearTriggerHistory: (source) => import_electron.ipcRenderer.invoke("triggerHistory:clear", source),
  /** Fires whenever the ledger changes (an inbound arrived, a verdict landed, a
   *  reply was paired), so the history tab live-refreshes. */
  onTriggerHistoryUpdated: (cb) => {
    const listener = () => cb();
    import_electron.ipcRenderer.on("triggerHistory:updated", listener);
    return () => import_electron.ipcRenderer.removeListener("triggerHistory:updated", listener);
  },
  // ─── Free Flow (voice dictation → message queue) ─────────────────────────────
  /** Persist Free Flow settings (flag / Groq key / model). The Groq key is stored
   *  in main config; entry point B (hold-Option) is renderer-side, no hotkey here. */
  freeflowSetConfig: (patch) => import_electron.ipcRenderer.invoke("freeflow:setConfig", patch),
  /** Transcribe one captured audio clip via Groq (the key stays in main; only the
   *  audio bytes go in and the transcript comes back). Gated on the flag + a key. */
  freeflowTranscribe: (arg) => import_electron.ipcRenderer.invoke("freeflow:transcribe", arg),
  // ─── Integrations registry (Phase 2 — labeled REST endpoints via the secret broker) ──
  // Bridges the §6 IPC surface for the Settings UI. WRITE-ONLY secret contract end to
  // end: `integrationsList` returns records with secretRef redacted to `hasSecret`;
  // `integrationsSetSecret` takes a secret ONE WAY (never echoed); NO method ever
  // returns a secret value to the renderer. Method names match registryClient's
  // feature-detection (camelCase ↔ colon-channel), so its real path activates as-is.
  integrationsList: () => import_electron.ipcRenderer.invoke("integrations:list"),
  integrationsTemplates: () => import_electron.ipcRenderer.invoke("integrations:templates"),
  integrationsUpsert: (record) => import_electron.ipcRenderer.invoke("integrations:upsert", record),
  integrationsSetSecret: (req) => import_electron.ipcRenderer.invoke("integrations:setSecret", req),
  integrationsRemove: (req) => import_electron.ipcRenderer.invoke("integrations:remove", req),
  integrationsTest: (req) => import_electron.ipcRenderer.invoke("integrations:test", req),
  // Per-CLI-provider BYOK keys — WRITE-ONLY. `providerKeySet` stores a backend key one
  // way (never echoed); `providerKeyHas` returns only a boolean; no method ever returns
  // the plaintext. Keys are materialized MAIN-ONLY at spawn.
  providerKeySet: (req) => import_electron.ipcRenderer.invoke("providerKey:set", req),
  providerKeyHas: (backend) => import_electron.ipcRenderer.invoke("providerKey:has", backend),
  providerKeyClear: (backend) => import_electron.ipcRenderer.invoke("providerKey:clear", backend),
  // Realtime Michael (voice orchestrator) — MAIN mints a short-lived EPHEMERAL token
  // from the BYOK OpenAI key; the real key NEVER crosses IPC. `realtimeHasOpenAiKey`
  // is a presence boolean only (gates the voice toggle, like providerKeyHas).
  realtimeHasOpenAiKey: () => import_electron.ipcRenderer.invoke("realtime:hasKey"),
  realtimeMintToken: (req) => import_electron.ipcRenderer.invoke("realtime:mintToken", req ?? {}),
  // rt-5 voice ACTIONS — the renderer holds NO policy; main (realtimeActions.ts) owns
  // the tiering, two-step verbal confirm, hard allowlist, and michael-voice
  // attribution. These just forward {verb,...args} and speak back `spoken`.
  realtimeAction: (payload) => import_electron.ipcRenderer.invoke("realtime:action", payload),
  realtimeActionConfirm: (req) => import_electron.ipcRenderer.invoke("realtime:action:confirm", req),
  realtimeActionCancel: () => import_electron.ipcRenderer.invoke("realtime:action:cancel"),
  // rt-12 completion seam — a voice-dispatched task finished. `summary` is the
  // human-speakable line Michael relays; the rest is context for a toast/log.
  onRealtimeCompletion: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("realtime:completion", listener);
    return () => import_electron.ipcRenderer.removeListener("realtime:completion", listener);
  },
  /** Tell main whether a live voice session is open (drives queue-vs-push for completions). */
  realtimeSetSessionLive: (live) => import_electron.ipcRenderer.invoke("realtime:setSessionLive", live),
  /** Drain completions that arrived while no session was open (warm-start catch-up). */
  realtimeDrainCompletions: () => import_electron.ipcRenderer.invoke("realtime:drainCompletions"),
  /** Block until a tracked task completes (or times out) — backs the wait_for tool. */
  realtimeWaitFor: (taskId, timeoutMs) => import_electron.ipcRenderer.invoke("realtime:waitFor", taskId, timeoutMs),
  /** v0.3.4: coalesced floor deltas pushed while a voice session is live — the
   *  renderer injects them into the conversation as silent items. */
  onRealtimeFloorDelta: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("realtime:floorDelta", listener);
    return () => import_electron.ipcRenderer.removeListener("realtime:floorDelta", listener);
  },
  /** v0.3.4: main-staged queue insertions (voice clear_context) — the renderer
   *  enqueues so delivery rides every existing safety gate. */
  onRealtimeEnqueue: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("realtime:enqueue", listener);
    return () => import_electron.ipcRenderer.removeListener("realtime:enqueue", listener);
  },
  /** v0.3.4: app self-knowledge — version + newest changelog sections. */
  appInfo: () => import_electron.ipcRenderer.invoke("app:info"),
  // ─── Roster mirror (agents + notes + queues, shared dev ↔ packaged) ─────────
  /** Read the roster file beside the hive. SYNCHRONOUS on purpose: the zustand
   *  store is created at module load, so an async read would arrive after the
   *  first render and the floor would flash empty. One blocking round trip at
   *  boot. `null` = no file (or unreadable) — the caller then uses localStorage. */
  rosterReadSync: () => {
    try {
      return import_electron.ipcRenderer.sendSync("roster:readSync") ?? null;
    } catch {
      return null;
    }
  },
  /** Which hive is open, synchronously — same boot-time constraint as
   *  `rosterReadSync`, and read in the same breath: the store has to know which
   *  hive its localStorage keys belong to before it decides to trust them. */
  harnessHomeSync: () => {
    try {
      return import_electron.ipcRenderer.sendSync("config:homeSync") ?? null;
    } catch {
      return null;
    }
  },
  /** Mirror the roster to disk. Debounced by the caller; main keeps the previous
   *  contents as a backup and refuses a first write that would empty a full file. */
  rosterWrite: (snap) => import_electron.ipcRenderer.invoke("roster:write", snap),
  // ─── Auto-update (v0.3.4; full state model v0.3.7) ──────────────────────────
  /** Push channel from main's updater — every stage of the pipeline, so the
   *  toolbar badge can show "checking", download progress, and the staged
   *  "restart to update" rather than only the terminal states. */
  onUpdateStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    import_electron.ipcRenderer.on("update:status", listener);
    return () => import_electron.ipcRenderer.removeListener("update:status", listener);
  },
  /** The last known status — a reloaded window subscribes AFTER main may have
   *  already emitted, so it pulls the current state instead of waiting 6h. */
  updateCurrent: () => import_electron.ipcRenderer.invoke("update:current"),
  /** Quit and install the downloaded update — only ever called from an explicit
   *  "restart to update" click. */
  updateRestartAndInstall: () => import_electron.ipcRenderer.invoke("update:restartAndInstall"),
  /** Manual re-check. */
  updateCheckNow: () => import_electron.ipcRenderer.invoke("update:checkNow"),
  /** Start the download for an already-detected update (autoDownload normally
   *  beats the user to it; this is the explicit one-click path). */
  updateDownload: () => import_electron.ipcRenderer.invoke("update:download"),
  /** Open the project's releases page for a notify-only update. */
  updateOpenRelease: (url) => import_electron.ipcRenderer.invoke("update:openRelease", url),
  /** Which OS this window runs on, for platform-specific copy. */
  platform: process.platform,
  arch: process.arch,
  /** DEV ONLY — fabricate an update status so the toast can be inspected without
   *  cutting a release. Refused (`{ok:false}`) in a packaged build; see the
   *  handler in updater.ts. Call it from the devtools console:
   *    await window.cth.updateSimulate()                       // notify-only digest toast
   *    await window.cth.updateSimulate({ state: 'downloaded' }) // restart-to-update toast
   *    await window.cth.updateSimulate({ drop: true })          // the centered release page
   *    await window.cth.updateSimulate({ notes: '<!-- drop -->…' }) // your own drop */
  updateSimulate: (opts) => import_electron.ipcRenderer.invoke("update:simulate", opts)
};
import_electron.contextBridge.exposeInMainWorld("cth", api);
