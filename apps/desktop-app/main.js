const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { buildStatusPayload, evaluateAlerts, orderAlerts } = require("./ontology/alerts");

app.name = "RADAS";
app.setName("RADAS");

let petWindow = null;
let consoleWindow = null;
let tray = null;
let consoleUrl = process.env.CONSOLE_URL || "";
let credWatcher = null;
let lastInjectedUsername = "";

// Resolve the console source: a bundled static build wins (offline-first —
// electron-builder copies ../console/dist to resources/console via
// extraResources), then CONSOLE_URL, then the dev default.
function resolveConsoleUrl() {
  if (consoleUrl) return consoleUrl;
  try {
    const bundled = path.join(process.resourcesPath || "", "console", "index.html");
    if (fs.existsSync(bundled)) return "file://" + bundled;
  } catch {}
  return "http://localhost:8080";
}

// --- single-instance lock --------------------------------------------------
// Without this, launching the app a second time would stack two sets of
// windows and two tray icons. The second instance is forwarded to the
// running one (Phase 4 will also use the argv for radas:// deep links).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    // Focus the existing console window when a second instance is launched.
    if (consoleWindow) {
      consoleWindow.show();
      consoleWindow.focus();
    }
    // Deep links on Windows/Linux arrive via the second-instance argv.
    const deepLink = argv.find((a) => a.startsWith("radas://"));
    if (deepLink) handleDeepLink(deepLink);
  });
}

// --- radas:// deep links (Phase 4) -----------------------------------------
// Supported:
//   radas://console/<path>   — open the console window at a route
//   radas://pet/show         — show/focus the pet
//   radas://login?api=...&token=...&refresh=... — CLI login handoff
//     (token is piped once into the console window's localStorage, then
//      dropped; it is never logged or persisted by the desktop app itself)
function handleDeepLink(urlStr) {
  let url;
  try { url = new URL(urlStr); } catch { return; }
  if (url.protocol !== "radas:") return;

  const host = url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0];

  if (host === "console") {
    const route = url.pathname.replace(/^\/+/, "/");
    if (consoleWindow) {
      consoleWindow.show();
      consoleWindow.focus();
      try {
        const target = new URL(consoleUrl);
        target.pathname = route || "/";
        consoleWindow.loadURL(target.toString());
      } catch {
        consoleWindow.loadURL(consoleUrl);
      }
    }
    return;
  }

  if (host === "pet") {
    if (petWindow) {
      petWindow.show();
      petWindow.focus();
    }
    return;
  }

  if (host === "login") {
    const api = url.searchParams.get("api");
    const token = url.searchParams.get("token");
    const refresh = url.searchParams.get("refresh");
    if (!token || !consoleWindow) return;
    if (api && api !== consoleUrl) {
      consoleUrl = api;
      consoleWindow.loadURL(api).then(() => {
        // Inject after the new origin finishes loading.
        const script = [
          `window.localStorage.setItem("auth_token", ${JSON.stringify(token)});`,
          refresh ? `window.localStorage.setItem("auth_refresh_token", ${JSON.stringify(refresh)});` : "",
          `window.localStorage.setItem("radas_desktop_mode", "true");`,
        ].filter(Boolean).join("\n");
        consoleWindow.webContents.executeJavaScript(script).then(() => {
          consoleWindow.webContents.reload();
        }).catch(() => {});
      }).catch(() => {});
    } else {
      const script = [
        `window.localStorage.setItem("auth_token", ${JSON.stringify(token)});`,
        refresh ? `window.localStorage.setItem("auth_refresh_token", ${JSON.stringify(refresh)});` : "",
        `window.localStorage.setItem("radas_desktop_mode", "true");`,
      ].filter(Boolean).join("\n");
      consoleWindow.show();
      consoleWindow.webContents.executeJavaScript(script).then(() => {
        consoleWindow.webContents.reload();
      }).catch(() => {});
    }
    return;
  }
}

// --- CLI credential store reader (Phase 2) ---------------------------------
// Reads ~/.config/radas/credentials.json and selector.json — the same files
// the Go CLI reads/writes. Secrets stay in the main process; only the
// username (for logging) and token injection (into the console window's
// localStorage) cross this boundary. Never logged.

function configDir() {
  return process.env.RADAS_CONFIG_DIR || path.join(os.homedir(), ".config", "radas");
}

function readCredentials() {
  try {
    const p = path.join(configDir(), "credentials.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const c = JSON.parse(raw);
    if (!c.access_token && !c.refresh_token) return null;
    return c;
  } catch {
    return null;
  }
}

function readSelector() {
  try {
    const p = path.join(configDir(), "selector.json");
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function getAuthStatus() {
  const c = readCredentials();
  if (!c) return { authenticated: false, username: null };
  return { authenticated: true, username: c.username || null };
}

// Inject CLI credentials into the console window's localStorage so the
// console's api.ts auth flow picks them up. Tokens never touch the pet
// renderer or any untrusted web content.
function injectCredentialsIntoConsole() {
  const c = readCredentials();
  const sel = readSelector();
  if (!c || !consoleWindow) return;

  if (c.api_url && c.api_url !== consoleUrl) {
    consoleUrl = c.api_url;
    consoleWindow.loadURL(consoleUrl);
    return; // loadURL triggers did-finish-load again; inject on the next round
  }

  const username = c.username || "";
  if (lastInjectedUsername === username && lastInjectedUsername !== "") {
    // Already injected for this session; don't spam reloads on every watch tick.
    return;
  }
  lastInjectedUsername = username;

  // The console's api.ts reads: auth_token, auth_refresh_token, active_org_id,
  // current_project_id. We set exactly those four keys.
  const script = [
    `window.localStorage.setItem("auth_token", ${JSON.stringify(c.access_token || "")});`,
    `window.localStorage.setItem("auth_refresh_token", ${JSON.stringify(c.refresh_token || "")});`,
    sel.org_id ? `window.localStorage.setItem("active_org_id", ${JSON.stringify(sel.org_id)});` : "",
    sel.project_id ? `window.localStorage.setItem("current_project_id", ${JSON.stringify(sel.project_id)});` : "",
    `window.localStorage.setItem("radas_desktop_mode", "true");`,
  ].filter(Boolean).join("\n");

  consoleWindow.webContents.executeJavaScript(script).then(() => {
    // Reload once so the console's route guard picks up the token.
    consoleWindow.webContents.reload();
  }).catch(() => {});
}

function clearConsoleSession() {
  if (!consoleWindow) return;
  lastInjectedUsername = "";
  const script = [
    `window.localStorage.removeItem("auth_token");`,
    `window.localStorage.removeItem("auth_refresh_token");`,
    `window.localStorage.removeItem("active_org_id");`,
    `window.localStorage.removeItem("current_project_id");`,
    `window.localStorage.removeItem("user_data");`,
  ].join("\n");
  consoleWindow.webContents.executeJavaScript(script).then(() => {
    consoleWindow.webContents.reload();
  }).catch(() => {});
}

// Watch the config directory for CLI-side changes (login, logout, project use).
function startCredentialWatcher() {
  const dir = configDir();
  try {
    if (!fs.existsSync(dir)) return;
    if (credWatcher) credWatcher.close();
    credWatcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
      if (filename !== "credentials.json" && filename !== "selector.json") return;
      // Small debounce — fs.watch fires multiple times per write.
      clearTimeout(startCredentialWatcher._t);
      startCredentialWatcher._t = setTimeout(() => {
        const c = readCredentials();
        if (c) {
          injectCredentialsIntoConsole();
        } else {
          clearConsoleSession();
        }
      }, 300);
    });
  } catch {}
}

// --- tray ------------------------------------------------------------------

function createTray() {
  const iconPath = path.join(__dirname, "tray_favicon.png");
  let icon = nativeImage.createFromPath(iconPath);

  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip("RADAS Desktop Companion");

  const contextMenu = Menu.buildFromTemplate([
    { label: "RADAS Desktop Companion", enabled: false },
    { type: "separator" },
    {
      label: "Show Pet Avatar",
      click: () => {
        if (petWindow) {
          petWindow.show();
          petWindow.focus();
        }
      },
    },
    {
      label: "Open RADAS Console",
      click: () => {
        if (consoleWindow) {
          consoleWindow.show();
          consoleWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit RADAS Desktop",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// --- application menu -------------------------------------------------------

function setupApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: "RADAS",
            submenu: [
              { label: "About RADAS", role: "about" },
              { type: "separator" },
              {
                label: "Open Console",
                accelerator: "CmdOrCtrl+O",
                click: () => {
                  if (consoleWindow) {
                    consoleWindow.show();
                    consoleWindow.focus();
                  }
                },
              },
              {
                label: "Show Pet Avatar",
                accelerator: "CmdOrCtrl+P",
                click: () => {
                  if (petWindow) {
                    petWindow.show();
                    petWindow.focus();
                  }
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide", label: "Hide RADAS" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              {
                label: "Quit RADAS",
                accelerator: "CmdOrCtrl+Q",
                click: () => {
                  app.isQuitting = true;
                  app.quit();
                },
              },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front", label: "Bring All to Front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- windows ----------------------------------------------------------------

const PRELOAD_PATH = path.join(__dirname, "preload.js");

function createWindows() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const appIconPath = path.join(__dirname, "app_icon.png");

  if (app.dock) {
    if (fs.existsSync(appIconPath)) {
      app.dock.setIcon(appIconPath);
    }
    app.dock.show();
  }

  // 1. Floating Desktop Pet Window
  petWindow = new BrowserWindow({
    width: 180,
    height: 160,
    x: Math.max(10, screenWidth - 200),
    y: Math.max(10, screenHeight - 190),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: true,
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH,
    },
  });

  petWindow.setAlwaysOnTop(true, "floating", 1);
  if (petWindow.setVisibleOnAllWorkspaces) {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const distPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distPath)) {
    petWindow.loadFile(distPath);
  } else {
    petWindow.loadURL("http://localhost:20130");
  }

  petWindow.show();
  petWindow.focus();

  // 2. RADAS Console Window
  consoleWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    show: true,
    frame: false,
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH,
    },
  });

  // Security: block navigation away from the console origin. Only the
  // configured CONSOLE_URL or the CLI credential store's api_url is allowed.
  const resolvedConsoleUrl = resolveConsoleUrl();
  const allowedOrigin = new URL(resolvedConsoleUrl).origin;
  consoleWindow.webContents.on("will-navigate", (event, url) => {
    let origin;
    try { origin = new URL(url).origin; } catch { origin = ""; }
    if (origin !== allowedOrigin) {
      event.preventDefault();
    }
  });

  // External links (target=_blank) go to the OS browser, not an Electron window.
  consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
    const { shell } = require("electron");
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Auto-login: after the console finishes loading, inject CLI credentials
  // if available, then reload once so the route guard picks up the token.
  consoleWindow.webContents.on("did-finish-load", () => {
    const c = readCredentials();
    if (c && c.access_token) {
      injectCredentialsIntoConsole();
    }
  });

  consoleWindow.loadURL(resolvedConsoleUrl);
  startCredentialWatcher();

  // --- IPC handlers (registered once) ---

  ipcMain.on("move-pet-window", (event, { deltaX, deltaY }) => {
    if (!petWindow) return;
    const [currentX, currentY] = petWindow.getPosition();
    petWindow.setPosition(currentX + deltaX, currentY + deltaY);
  });

  ipcMain.handle("get-screen-work-area", () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      workArea: primaryDisplay.workArea,
      bounds: primaryDisplay.bounds,
      scaleFactor: primaryDisplay.scaleFactor || 1,
    };
  });

  ipcMain.handle("get-pet-position", () => {
    if (!petWindow) return [0, 0];
    return petWindow.getPosition();
  });

  let lastSetPos = 0;
  ipcMain.on("set-pet-position", (event, { x, y }) => {
    if (!petWindow) return;
    // 60 FPS smooth window updates (~16ms)
    const now = Date.now();
    if (now - lastSetPos < 16) return;
    lastSetPos = now;
    petWindow.setPosition(Math.round(x), Math.round(y), false);
  });

  let prevCpuTimes = os.cpus().map((c) => c.times);
  ipcMain.handle("get-device-status", () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsagePct = Math.round((1 - freeMem / totalMem) * 100);
    const uptimeHours = Math.floor(os.uptime() / 3600);
    const loadAvg = os.loadavg();
    const cpus = os.cpus();

    let totalIdle = 0;
    let totalTick = 0;
    const currentTimes = cpus.map((c) => c.times);
    for (let i = 0; i < cpus.length; i++) {
      const prev = prevCpuTimes[i] || { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
      const curr = currentTimes[i] || prev;
      const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + (prev.irq || 0);
      const currTotal = curr.user + curr.nice + curr.sys + curr.idle + (curr.irq || 0);
      totalIdle += curr.idle - prev.idle;
      totalTick += currTotal - prevTotal;
    }
    prevCpuTimes = currentTimes;
    const cpuUsagePct = totalTick > 0 ? Math.round(100 - (100 * totalIdle) / totalTick) : 0;

    let idleSeconds = 0;
    try {
      const { powerMonitor } = require("electron");
      idleSeconds = powerMonitor ? powerMonitor.getSystemIdleTime() : 0;
    } catch {}

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    return {
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus[0]?.model || "Apple Silicon / x64",
      cpuCores: cpus.length,
      cpuUsagePct: Math.max(0, Math.min(100, cpuUsagePct)),
      memUsagePct: Math.max(0, Math.min(100, memUsagePct)),
      memFreeGB: +(freeMem / (1024 * 1024 * 1024)).toFixed(1),
      memTotalGB: +(totalMem / (1024 * 1024 * 1024)).toFixed(1),
      loadAvg1m: +(loadAvg[0] || 0).toFixed(2),
      uptimeHours,
      idleSeconds,
      currentHour,
      currentDay,
      isLateNight: currentHour >= 0 && currentHour < 6,
      isMorning: currentHour >= 6 && currentHour < 12,
      isAfternoon: currentHour >= 12 && currentHour < 18,
      isEvening: currentHour >= 18 && currentHour <= 23,
      isFriday: currentDay === 5,
      isWeekend: currentDay === 0 || currentDay === 6,
    };
  });

  ipcMain.on("toggle-console", () => {
    if (!consoleWindow) return;
    if (consoleWindow.isVisible()) {
      consoleWindow.hide();
    } else {
      consoleWindow.show();
      consoleWindow.focus();
    }
  });

  ipcMain.on("open-console-at", (event, { route }) => {
    if (!consoleWindow) return;
    consoleWindow.show();
    consoleWindow.focus();
    try {
      const url = new URL(resolveConsoleUrl());
      url.pathname = route || "/";
      consoleWindow.loadURL(url.toString());
    } catch {
      consoleWindow.loadURL(resolveConsoleUrl());
    }
  });

  ipcMain.on("window-minimize", () => consoleWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    if (consoleWindow?.isMaximized()) {
      consoleWindow.unmaximize();
    } else {
      consoleWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => {
    if (app.isQuitting) {
      consoleWindow?.close();
    } else {
      consoleWindow?.hide();
    }
  });

  ipcMain.handle("get-auth-status", () => {
    return getAuthStatus();
  });

  // Phase 3: RADAS status polling — aggregate counts evaluated against the
  // domain ontology's alert rules (fetched live from /api/ontology/alerts;
  // same Bearer token, no extra secrets). Rules evaluate here in the main
  // process; the renderer only sees {status, alerts} — never tokens.
  let cachedStatus = null;
  ipcMain.handle("get-radas-status", async () => {
    if (cachedStatus) return cachedStatus;
    const c = readCredentials();
    if (!c || !c.access_token) {
      return { authenticated: false, workers: { total: 0, online: 0 }, approvalsPending: 0, alerts: [] };
    }
    const base = c.api_url || consoleUrl;
    const headers = { Authorization: `Bearer ${c.access_token}` };
    try {
      const [workersRes, approvalsRes, alertsRes] = await Promise.allSettled([
        fetch(`${base}/api/admin/workers`, { headers }),
        fetch(`${base}/api/approvals?status=pending`, { headers }),
        fetch(`${base}/api/ontology/alerts`, { headers }),
      ]);
      let workers = { total: 0, online: 0 };
      let approvalsPending = 0;
      if (workersRes.status === "fulfilled" && workersRes.value.ok) {
        const data = await workersRes.value.json();
        const list = data.workers || data.data?.workers || [];
        workers = { total: list.length, online: list.filter((w) => w.is_online || w.status === "online").length };
      }
      if (approvalsRes.status === "fulfilled" && approvalsRes.value.ok) {
        const data = await approvalsRes.value.json();
        const list = data.approvals || data.data?.approvals || [];
        approvalsPending = list.length;
      }
      // Ontology rules; empty when the endpoint is unavailable, in which
      // case no alerts fire and the pet falls back to its idle rotation.
      let rules = {};
      if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
        const data = await alertsRes.value.json();
        rules = data.alerts || data.data?.alerts || {};
      }
      const status = buildStatusPayload({ workers, approvals: { pending: approvalsPending } });
      const alerts = orderAlerts(evaluateAlerts(rules, status)).map(([id, rule]) => ({
        id,
        severity: rule.severity,
        route: rule.route,
        title: rule.title,
      }));
      cachedStatus = { authenticated: true, status, alerts };
      setTimeout(() => { cachedStatus = null; }, 30000);
      return cachedStatus;
    } catch {
      return { authenticated: true, status: buildStatusPayload(), alerts: [], error: true };
    }
  });
}

// --- lifecycle --------------------------------------------------------------

app.whenReady().then(() => {
  // Register the radas:// protocol handler. On macOS deep links arrive via
  // the open-url event; on Windows/Linux via the second-instance argv (and
  // process.argv on cold start).
  app.setAsDefaultProtocolClient("radas");
  app.on("open-url", (event, urlStr) => {
    event.preventDefault();
    handleDeepLink(urlStr);
  });

  createTray();
  setupApplicationMenu();
  createWindows();

  // Cold-start deep link (Windows/Linux: the URL is in process.argv).
  const coldLink = process.argv.find((a) => a.startsWith("radas://"));
  if (coldLink) {
    setTimeout(() => handleDeepLink(coldLink), 1500); // wait for windows
  }

  app.on("activate", () => {
    if (petWindow) {
      petWindow.show();
      petWindow.focus();
    } else {
      createWindows();
    }
  });
});

// before-quit: set the flag so window-close hides vs. actually closes.
app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  if (credWatcher) credWatcher.close();
  if (process.platform !== "darwin") app.quit();
});
