const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  setWindowPosition: (x, y) => ipcRenderer.send("set-window-position", x, y),
  getWorkAreaSize: () => ipcRenderer.invoke("get-work-area-size"),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send("set-ignore-mouse-events", ignore, options),
  getMousePosition: () => ipcRenderer.invoke("get-mouse-position"),

  resizeWindow: (width, height) =>
    ipcRenderer.send("resize-window", width, height),
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  restoreWindowTransparency: () =>
    ipcRenderer.invoke("restore-window-transparency"),
});
