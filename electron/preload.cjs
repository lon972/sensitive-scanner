const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scannerApi", {
  chooseDirectories: () => ipcRenderer.invoke("dialog:choose-directories"),
  getRuntimePaths: () => ipcRenderer.invoke("app:get-runtime-paths"),
  getRecentReports: () => ipcRenderer.invoke("reports:list"),
  startScan: (options) => ipcRenderer.invoke("scan:start", JSON.parse(JSON.stringify(options))),
  pauseScan: () => ipcRenderer.invoke("scan:pause"),
  resumeScan: () => ipcRenderer.invoke("scan:resume"),
  cancelScan: () => ipcRenderer.invoke("scan:cancel"),
  onScanProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath)
});
