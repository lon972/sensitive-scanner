import path from "node:path";
import type { App } from "electron";

export function getProjectRoot(app: App): string {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

export function getBinaryRoot(app: App): string {
  return app.isPackaged ? path.join(process.resourcesPath, "binaries") : path.join(getProjectRoot(app), "binaries");
}

export function getPlatformBinaryDir(app: App): string {
  return path.join(getBinaryRoot(app), process.platform === "win32" ? "win" : "mac");
}

export function getRulesFilePath(app: App): string {
  return path.join(getProjectRoot(app), "rules", "keywords.txt");
}
