import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, ScanOptions, ScanProgressEvent } from "../shared/types.js";

const api: DesktopApi = {
  chooseDirectories: () => ipcRenderer.invoke("dialog:choose-directories"),
  getRuntimePaths: () => ipcRenderer.invoke("app:get-runtime-paths"),
  getRecentReports: () => ipcRenderer.invoke("reports:list"),
  startScan: (options: ScanOptions) => ipcRenderer.invoke("scan:start", options),
  pauseScan: () => ipcRenderer.invoke("scan:pause"),
  resumeScan: () => ipcRenderer.invoke("scan:resume"),
  cancelScan: () => ipcRenderer.invoke("scan:cancel"),
  onScanProgress: (callback: (event: ScanProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScanProgressEvent) => callback(payload);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  openPath: (targetPath: string) => ipcRenderer.invoke("shell:open-path", targetPath)
};

contextBridge.exposeInMainWorld("scannerApi", api);
