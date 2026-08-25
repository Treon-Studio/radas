/**
 * RADAS Desktop App Bridge (IPC Communication with Electron / Tauri Desktop Wrapper)
 */

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && (!!(window as any).require || !!(window as any).__TAURI__);
}

export function minimizeWindow() {
  if (typeof window !== "undefined" && (window as any).require) {
    try {
      const { ipcRenderer } = (window as any).require("electron");
      ipcRenderer.send("window-minimize");
    } catch (e) {
      console.log("minimizeWindow error", e);
    }
  }
}

export function maximizeWindow() {
  if (typeof window !== "undefined" && (window as any).require) {
    try {
      const { ipcRenderer } = (window as any).require("electron");
      ipcRenderer.send("window-maximize");
    } catch (e) {
      console.log("maximizeWindow error", e);
    }
  }
}

export function closeWindow() {
  if (typeof window !== "undefined" && (window as any).require) {
    try {
      const { ipcRenderer } = (window as any).require("electron");
      ipcRenderer.send("window-close");
    } catch (e) {
      console.log("closeWindow error", e);
    }
  }
}
