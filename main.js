const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  shell,
  Menu,
  clipboard,
} = require("electron");
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
  return {
    apiBase: process.env.PIXELPAWS_API_BASE || "",
    apiToken: process.env.PIXELPAWS_API_TOKEN || "",
    selectedCatId: "",
    webBase: process.env.PIXELPAWS_WEB_BASE || "",
  };
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
    resizable: false,
    // Tiny alpha helps some macOS/GPU combos paint transparent windows
    backgroundColor: opaqueDebug ? "#222222" : "#00000001",
    hasShadow: false,
    skipTaskbar: true,
    icon: path.join(__dirname, "assets/icons/image.png"),
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

  // Open DevTools
  // catWindow.webContents.openDevTools({ mode: "detach" });

  // Pipe renderer console logs to main process stdout for easier debugging
  catWindow.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      const levelTag = ["LOG", "WARN", "ERROR"][Math.min(level, 2)] || "LOG";
      console.log(`[renderer:${levelTag}] ${sourceId}:${line} ${message}`);
    }
  );

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

  ipcMain.on("resize-window", (event, width, height) => {
    if (catWindow) {
      catWindow.setSize(width, height);
    }
  });

  ipcMain.handle("toggle-fullscreen", () => {
    // 전체화면 기능은 더 이상 사용하지 않음
    return { ok: true, isFullScreen: false };
  });

  ipcMain.handle("get-mouse-position", () => {
    return screen.getCursorScreenPoint();
  });

  ipcMain.handle("restore-window-transparency", () => {
    if (catWindow) {
      const opaqueDebug = process.env.OPAQUE_DEBUG === "1";

      // 창의 투명도와 그림자 설정을 원래대로 복원
      catWindow.setBackgroundColor(opaqueDebug ? "#222222" : "#00000001");
      catWindow.setHasShadow(false);

      // 창이 항상 최상위에 있도록 설정
      catWindow.setAlwaysOnTop(true);

      // 창 크기 조절 비활성화
      catWindow.setResizable(false);

      // 마우스 이벤트 무시 설정 (투명한 영역 클릭 방지)
      catWindow.setIgnoreMouseEvents(false);

      return { ok: true };
    }
    return { ok: false, error: "no-window" };
  });

  catWindow.on("closed", () => {
    catWindow = null;
  });

  // Context menu: open/copy web control link & copy device id
  catWindow.webContents.on("context-menu", async (_e) => {
    const template = [
      {
        label: "Open Control Panel",
        click: async () => {
          const cfg = loadConfig();
          const id = await getOrCreateDeviceId();
          const url = buildControlUrl(cfg, id);
          if (url) shell.openExternal(url);
        },
      },
      {
        label: "Copy Control Link",
        click: async () => {
          const cfg = loadConfig();
          const id = await getOrCreateDeviceId();
          const url = buildControlUrl(cfg, id);
          if (url) clipboard.writeText(url);
        },
      },
      {
        type: "separator",
      },
      {
        label: "Copy Device ID",
        click: async () => {
          const id = await getOrCreateDeviceId();
          clipboard.writeText(id);
        },
      },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: catWindow });
  });

  async function getOrCreateDeviceId() {
    const cfg = loadConfig();
    if (cfg.deviceId && typeof cfg.deviceId === "string") return cfg.deviceId;
    const id = crypto.randomUUID();
    saveConfig({ ...cfg, deviceId: id });
    return id;
  }

  function buildControlUrl(cfg, deviceId) {
    const base = (cfg.webBase || "").trim();
    if (!base) return "";
    const clean = base.replace(/\/$/, "");
    return `${clean}/?device=${encodeURIComponent(deviceId)}`;
  }
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
