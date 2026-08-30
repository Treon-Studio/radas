// RADAS Desktop preload bridge.
//
// Exposes a minimal, allowlisted API surface to both renderer windows via
// contextBridge. Renderers never see Electron, Node, or the IPC channels
// directly — every capability here maps 1:1 to a main-process handler in
// main.js, and secrets (credential tokens) are deliberately NOT part of this
// surface: they stay in the main process and are injected into the console
// window's localStorage there.
const { contextBridge, ipcRenderer } = require("electron");

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
