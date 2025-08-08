const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let catWindow;

// --- Simple JSON config stored under userData ---
const getConfigPath = () => path.join(app.getPath("userData"), "config.json");
function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      return JSON.parse(raw);
    }
  } catch (_) {}
  return { apiBase: process.env.PIXELPAWS_API_BASE || "", apiToken: process.env.PIXELPAWS_API_TOKEN || "", selectedCatId: "" };
}
function saveConfig(cfg) {
  try {
    const p = getConfigPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg ?? {}, null, 2), "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const opaqueDebug = process.env.OPAQUE_DEBUG === "1";

  catWindow = new BrowserWindow({
    width: 128,
    height: 128,
    transparent: !opaqueDebug,
    frame: false,
    alwaysOnTop: true,
    // Tiny alpha helps some macOS/GPU combos paint transparent windows
    backgroundColor: opaqueDebug ? "#222222" : "#00000001",
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  catWindow.loadFile(path.join(__dirname, "cat.html"));

  // Keep window interactive by default
  catWindow.setIgnoreMouseEvents(false);

  // Open DevTools to surface any preload/renderer errors
  catWindow.webContents.openDevTools({ mode: "detach" });

  // Pipe renderer console logs to main process stdout for easier debugging
  catWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    const levelTag = ["LOG", "WARN", "ERROR"][Math.min(level, 2)] || "LOG";
    console.log(`[renderer:${levelTag}] ${sourceId}:${line} ${message}`);
  });

  // Config IPC
  ipcMain.handle("get-config", () => loadConfig());
  ipcMain.handle("set-config", (_evt, partial) => {
    const current = loadConfig();
    const next = { ...current, ...(partial || {}) };
    return saveConfig(next);
  });
  ipcMain.handle("open-external", (_evt, url) => shell.openExternal(url));

  // Device identity (persisted) for SaaS remote control
  ipcMain.handle("get-device-id", () => {
    const cfg = loadConfig();
    if (cfg.deviceId && typeof cfg.deviceId === "string") return cfg.deviceId;
    const id = crypto.randomUUID();
    saveConfig({ ...cfg, deviceId: id });
    return id;
  });

  // Window visibility toggle
  ipcMain.handle("set-window-visibility", (_evt, visible) => {
    try {
      if (!catWindow) return { ok: false, error: "no-window" };
      if (visible) {
        catWindow.showInactive();
        catWindow.setIgnoreMouseEvents(false);
      } else {
        catWindow.setIgnoreMouseEvents(true, { forward: true });
        catWindow.hide();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.on("set-window-position", (event, x, y) => {
    catWindow.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.handle("get-work-area-size", () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return primaryDisplay.workAreaSize;
  });

  ipcMain.on("set-ignore-mouse-events", (event, ignore, options) => {
    catWindow.setIgnoreMouseEvents(ignore, options);
  });

  ipcMain.handle("get-mouse-position", () => {
    return screen.getCursorScreenPoint();
  });

  ipcMain.handle("move-mouse", async (_evt, x, y) => {
    try {
      // Try to lazy-require nut-js to move the system cursor (optional dependency)
      const { mouse, straightTo } = require("@nut-tree/nut-js");
      await mouse.move(straightTo({ x: Math.round(x), y: Math.round(y) }));
      return { ok: true };
    } catch (e) {
      // nut-js not installed or failed; fall back silently
      return { ok: false, error: String(e) };
    }
  });

  catWindow.on("closed", () => {
    catWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
