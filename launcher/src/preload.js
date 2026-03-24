const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("augur", {
  // Window controls
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),

  // Game
  findGamePath: () => ipcRenderer.invoke("game:findPath"),
  setGamePath: (p) => ipcRenderer.invoke("game:setPath", p),
  selectFolder: () => ipcRenderer.invoke("game:selectFolder"),
  launch: () => ipcRenderer.invoke("game:launch"),

  // Server
  getStatus: () => ipcRenderer.invoke("server:status"),
  getNews: () => ipcRenderer.invoke("launcher:news"),

  // Settings
  getHD: () => ipcRenderer.invoke("settings:getHD"),
  setHD: (enabled) => ipcRenderer.invoke("settings:setHD", enabled),
  getHDOptions: () => ipcRenderer.invoke("settings:getHDOptions"),
  setHDOptions: (opts) => ipcRenderer.invoke("settings:setHDOptions", opts),

  // Updates
  checkUpdates: () => ipcRenderer.invoke("launcher:checkUpdates"),
  downloadUpdates: (updates) => ipcRenderer.invoke("launcher:downloadUpdates", updates),
  onDownloadProgress: (cb) => ipcRenderer.on("download:progress", (_, data) => cb(data)),
});
