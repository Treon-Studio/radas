// Console-window preload bundle: exposes BOTH bridges to the console page —
//   window.cth          ← munder-difflin's real preload API (hive/pty/config)
//   window.radasDesktop ← RADAS window controls (minimize/maximize/close)
import "./preload/index";
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("radasDesktop", {
  windowMinimize: () => ipcRenderer.send("window-minimize"),
  windowMaximize: () => ipcRenderer.send("window-maximize"),
  windowClose: () => ipcRenderer.send("window-close"),
});
