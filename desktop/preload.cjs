const { contextBridge, ipcRenderer } = require("electron");
// No generic IPC, URLs, filesystem paths, commands or approval tokens.
contextBridge.exposeInMainWorld(
  "agentsUpdates",
  Object.freeze({
    getStatus: () => ipcRenderer.invoke("agents:update:status"),
    check: () => ipcRenderer.invoke("agents:update:check"),
    download: () => ipcRenderer.invoke("agents:update:download"),
    cancel: () => ipcRenderer.invoke("agents:update:cancel"),
    install: () => ipcRenderer.invoke("agents:update:install"),
    onStatus: (listener) => {
      const callback = (_event, status) => listener(status);
      ipcRenderer.on("agents:update:status", callback);
      return () => ipcRenderer.removeListener("agents:update:status", callback);
    },
  }),
);
