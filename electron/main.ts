import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runScan, type ScanControls } from "../scanner/scanEngine.js";
import type { RecentReport, RuntimePaths, ScanOptions, ScanProgressEvent, ScanReport } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let lastProgress: ScanProgressEvent | null = null;
let activeScanControl: {
  paused: boolean;
  cancelled: boolean;
  resumeWaiters: Array<() => void>;
} | null = null;

const isDev = !app.isPackaged;

function getAppRoot() {
  return isDev ? process.cwd() : app.getAppPath();
}

function getReportsDir() {
  return isDev
    ? path.join(getAppRoot(), "reports")
    : path.join(app.getPath("documents"), "SensitiveScanner", "reports");
}

function getRendererEntryUrl() {
  if (isDev) return "http://localhost:5173";
  return pathToFileURL(path.join(getAppRoot(), "dist", "index.html")).toString();
}

async function ensureDirectories() {
  await fs.mkdir(getReportsDir(), { recursive: true });
}

function getDefaultTargets(): string[] {
  const home = app.getPath("home");
  return ["Desktop", "Documents", "Downloads"]
    .map((folder) => path.join(home, folder))
    .filter(Boolean);
}

async function createWindow() {
  await ensureDirectories();

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#09111d",
    title: "SensitiveScanner",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const rendererEntryUrl = getRendererEntryUrl();
  const enforceRendererEntry = () => {
    const currentUrl = mainWindow?.webContents.getURL() ?? "";
    if (!isDev && currentUrl && !currentUrl.endsWith("/dist/index.html")) {
      mainWindow?.webContents.loadURL(rendererEntryUrl);
    }
  };

  mainWindow.webContents.on("did-finish-load", enforceRendererEntry);
  mainWindow.webContents.on("did-navigate", enforceRendererEntry);
  mainWindow.webContents.on("did-fail-load", () => {
    if (!isDev) mainWindow?.webContents.loadURL(rendererEntryUrl);
  });

  if (isDev) {
    await mainWindow.loadURL(rendererEntryUrl);
  } else {
    await mainWindow.loadURL(rendererEntryUrl);
  }
}

function sendProgress(event: ScanProgressEvent) {
  lastProgress = event;
  mainWindow?.webContents.send("scan:progress", event);
}

function createScanControls(): ScanControls {
  activeScanControl = {
    paused: false,
    cancelled: false,
    resumeWaiters: []
  };

  return {
    isPaused: () => Boolean(activeScanControl?.paused),
    isCancelled: () => Boolean(activeScanControl?.cancelled),
    waitWhilePaused: async () => {
      while (activeScanControl?.paused && !activeScanControl.cancelled) {
        await new Promise<void>((resolve) => activeScanControl?.resumeWaiters.push(resolve));
      }
    }
  };
}

function releaseScanWaiters() {
  const waiters = activeScanControl?.resumeWaiters.splice(0) ?? [];
  waiters.forEach((resolve) => resolve());
}

async function listRecentReports(): Promise<RecentReport[]> {
  const reportsDir = getReportsDir();
  await ensureDirectories();
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  const reportIds = [...new Set(entries
    .filter((entry) => entry.isFile() && /^report_.+\.(html|txt|pdf)$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.(html|txt|pdf)$/, "")))]
    .sort()
    .reverse()
    .slice(0, 8);

  return await Promise.all(reportIds.map(async (id) => {
    const htmlPath = path.join(reportsDir, `${id}.html`);
    const txtPath = path.join(reportsDir, `${id}.txt`);
    const pdfPath = path.join(reportsDir, `${id}.pdf`);
    const existingPaths = await Promise.all([htmlPath, txtPath, pdfPath].map(async (filePath) => {
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        return undefined;
      }
    }));
    const stat = await fs.stat(existingPaths.find(Boolean) ?? reportsDir);
    return {
      id,
      createdAt: stat.mtime.toISOString(),
      htmlPath: existingPaths[0],
      txtPath: existingPaths[1],
      pdfPath: existingPaths[2]
    };
  }));
}

async function createPdfFromHtml(html: string, pdfPath: string) {
  const pdfSourcePath = pdfPath.replace(/\.pdf$/i, ".pdf-source.html");
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await fs.writeFile(pdfSourcePath, html, "utf8");
    await pdfWindow.loadFile(pdfSourcePath);
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: {
        marginType: "default"
      }
    });
    await fs.writeFile(pdfPath, pdfBuffer);
  } finally {
    pdfWindow.close();
    await fs.unlink(pdfSourcePath).catch(() => undefined);
  }
}

async function openScanArtifacts(report: ScanReport, reportsDir: string) {
  const primaryArtifact = report.artifact.pdfPath ?? report.artifact.htmlPath ?? report.artifact.txtPath;

  try {
    if (primaryArtifact) await shell.openPath(primaryArtifact);
    await shell.openPath(reportsDir);
  } catch (error) {
    console.error("Failed to open scan artifacts", error);
  }
}

ipcMain.handle("dialog:choose-directories", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "multiSelections", "createDirectory"]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("app:get-runtime-paths", async (): Promise<RuntimePaths> => ({
  reportsDir: getReportsDir(),
  defaultTargets: getDefaultTargets()
}));

ipcMain.handle("reports:list", async () => listRecentReports());

ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
  await shell.openPath(targetPath);
});

ipcMain.handle("scan:start", async (_event, options: ScanOptions): Promise<ScanReport> => {
  if (activeScanControl) throw new Error("已有扫描正在运行");
  const reportsDir = getReportsDir();
  const controls = createScanControls();
  const report = await runScan({
    app,
    options,
    reportsDir,
    controls,
    onProgress: sendProgress,
    createPdf: createPdfFromHtml
  }).finally(() => {
    activeScanControl = null;
  });

  void openScanArtifacts(report, reportsDir);
  return report;
});

ipcMain.handle("scan:pause", async () => {
  if (!activeScanControl || activeScanControl.paused) return;
  activeScanControl.paused = true;
  sendProgress({
    ...(lastProgress ?? {
      scannedFiles: 0,
      totalFiles: 0,
      riskCounts: { high: 0, medium: 0, low: 0 }
    }),
    phase: "paused",
    message: "扫描已暂停，将在当前文件处理完成后停住",
  });
});

ipcMain.handle("scan:resume", async () => {
  if (!activeScanControl) return;
  activeScanControl.paused = false;
  releaseScanWaiters();
});

ipcMain.handle("scan:cancel", async () => {
  if (!activeScanControl) return;
  activeScanControl.cancelled = true;
  activeScanControl.paused = false;
  releaseScanWaiters();
  sendProgress({
    ...(lastProgress ?? {
      scannedFiles: 0,
      totalFiles: 0,
      riskCounts: { high: 0, medium: 0, low: 0 }
    }),
    phase: "cancelled",
    message: "扫描已取消",
  });
});

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
