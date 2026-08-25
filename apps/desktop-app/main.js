const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require("electron");
const path = require("path");

app.name = "RADAS";
app.setName("RADAS");

let petWindow = null;
let consoleWindow = null;
let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, "tray_favicon.png");
  let icon = nativeImage.createFromPath(iconPath);

  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip("RADAS Desktop Companion & AI Gateway");

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

function createWindows() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Show dock icon explicitly on macOS
  if (app.dock) {
    app.dock.show();
  }

  // 1. Floating Desktop Pet Window (Always-on-top, visible across all workspaces)
  petWindow = new BrowserWindow({
    width: 90,
    height: 95,
    x: Math.max(10, screenWidth - 110),
    y: Math.max(10, screenHeight - 140),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Level floating ensures it floats over all desktop windows on macOS
  petWindow.setAlwaysOnTop(true, "floating", 1);
  if (petWindow.setVisibleOnAllWorkspaces) {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const fs = require("fs");
  const distPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distPath)) {
    petWindow.loadFile(distPath);
  } else {
    petWindow.loadURL("http://localhost:20130");
  }

  petWindow.show();
  petWindow.focus();

  // 2. RADAS Console Window (Main app window)
  consoleWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    show: true, // Show main console window on boot
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const consoleUrl = process.env.CONSOLE_URL || "http://localhost:8080";
  consoleWindow.loadURL(consoleUrl);

  // IPC Event: Move Pet Window across desktop screen
  ipcMain.on("move-pet-window", (event, { deltaX, deltaY }) => {
    if (!petWindow) return;
    const [currentX, currentY] = petWindow.getPosition();
    petWindow.setPosition(currentX + deltaX, currentY + deltaY);
  });

  // IPC Event: Toggle Console Window from Pet click
  ipcMain.on("toggle-console", () => {
    if (!consoleWindow) return;
    if (consoleWindow.isVisible()) {
      consoleWindow.hide();
    } else {
      consoleWindow.show();
      consoleWindow.focus();
    }
  });

  // IPC Event: Window controls
  ipcMain.on("window-minimize", () => consoleWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    if (consoleWindow?.isMaximized()) {
      consoleWindow.unmaximize();
    } else {
      consoleWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => consoleWindow?.hide());
}

app.whenReady().then(() => {
  createTray();
  createWindows();

  app.on("activate", () => {
    if (petWindow) {
      petWindow.show();
      petWindow.focus();
    } else {
      createWindows();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
