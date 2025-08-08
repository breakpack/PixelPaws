const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  setWindowPosition: (x, y) => ipcRenderer.send("set-window-position", x, y),
  getWorkAreaSize: () => ipcRenderer.invoke("get-work-area-size"),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send("set-ignore-mouse-events", ignore, options),
  getMousePosition: () => ipcRenderer.invoke("get-mouse-position"),
  moveMouse: (x, y) => ipcRenderer.invoke("move-mouse", x, y),
  // Config bridge for SaaS integration
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (partial) => ipcRenderer.invoke("set-config", partial),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getDeviceId: () => ipcRenderer.invoke("get-device-id"),
  setWindowVisibility: (visible) => ipcRenderer.invoke("set-window-visibility", visible),
});
