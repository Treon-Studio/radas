/**
 * RADAS Desktop App Bridge (IPC Communication with Electron / Tauri Desktop Wrapper).
 *
 * Uses the preload-exposed `window.radasDesktop` API when available (contextIsolation:
 * true). Falls back to the legacy `window.require("electron")` path for backward
 * compatibility when the console runs in a browser or an older desktop wrapper that
 * hasn't migrated to the preload bridge yet.
 */

/** Type of the preload-exposed bridge (only a subset is used here). */
interface RadasDesktopBridge {
  windowMinimize?: () => void;
  windowMaximize?: () => void;
  windowClose?: () => void;
}

function bridge(): RadasDesktopBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { radasDesktop?: RadasDesktopBridge }).radasDesktop;
  if (b) return b;
  // Legacy fallback: raw electron require (nodeIntegration: true, pre-preload era).
  try {
    if ((window as any).require) {
      const { ipcRenderer } = (window as any).require("electron");
      return {
        windowMinimize: () => ipcRenderer.send("window-minimize"),
        windowMaximize: () => ipcRenderer.send("window-maximize"),
        windowClose: () => ipcRenderer.send("window-close"),
      };
    }
  } catch {
    // ignore — not in an Electron context
  }
  return null;
}

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as any).radasDesktop ||
    (window as any).__TAURI__ ||
    (window as any).require ||
    (typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent)) ||
    window.location.search.includes("desktop=1") ||
    window.localStorage.getItem("radas_desktop_mode") === "true"
  );
}

export function minimizeWindow() {
  bridge()?.windowMinimize?.();
}

export function maximizeWindow() {
  bridge()?.windowMaximize?.();
}

export function closeWindow() {
  bridge()?.windowClose?.();
}
