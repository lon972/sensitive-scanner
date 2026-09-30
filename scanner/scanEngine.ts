import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";
import type { FileScanResult, KeywordRule, RiskLevel, ScanOptions, ScanProgressEvent, ScanReport } from "../shared/types.js";
import { buildMatches, detectTextFile, isLikelyTextFile, scanTextFile } from "./textScanner.js";
import { detectImageFile, scanImage, scanPdf } from "./ocrScanner.js";
import { parseOfficeFile } from "./officeParser.js";
import { assessRisk } from "./riskAnalyzer.js";
import { generateReports } from "./reportGenerator.js";
import { getRulesFilePath } from "./runtimePaths.js";

const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const EXCLUDED_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "Library",
  "AppData",
  "System Volume Information",
  ".DS_Store",
  "Thumbs.db",
  "ehthumbs.db",
  "desktop.ini",
  "__MACOSX"
]);
const FILESYSTEM_OPERATION_TIMEOUT_MS = 5_000;
const DISCOVERY_PROGRESS_INTERVAL_MS = 750;
const EVENT_LOOP_YIELD_INTERVAL = 128;

interface RunScanContext {
  app: App;
  options: ScanOptions;
  reportsDir: string;
  onProgress: (event: ScanProgressEvent) => void;
  controls?: ScanControls;
  createPdf?: (html: string, pdfPath: string) => Promise<void>;
}

export class ScanCancelledError extends Error {
  constructor() {
    super("扫描已取消");
    this.name = "ScanCancelledError";
  }
}

export interface ScanControls {
  isPaused: () => boolean;
  isCancelled: () => boolean;
  waitWhilePaused: () => Promise<void>;
}

interface DiscoveryState {
  discoveredFiles: number;
  skippedPaths: number;
  visitedEntries: number;
  lastProgressAt: number;
}

class FileSystemTimeoutError extends Error {
  constructor(detail: string) {
    super(`${detail} 响应超过 ${Math.round(FILESYSTEM_OPERATION_TIMEOUT_MS / 1000)} 秒`);
    this.name = "FileSystemTimeoutError";
  }
}

function parseRiskLevel(value: string | undefined): RiskLevel | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["high", "高", "高危"].includes(normalized)) return "high";
  if (["medium", "mid", "中", "中危"].includes(normalized)) return "medium";
  if (["low", "低", "低危"].includes(normalized)) return "low";
  return undefined;
}

function parseKeywordRule(rawKeyword: string): KeywordRule | null {
  let keyword = rawKeyword.trim();
  let riskLevel: RiskLevel | undefined;
  let riskScore: number | undefined;

  const bracketMatch = keyword.match(/^\[(high|medium|mid|low|高危|中危|低危|高|中|低)\]\s*(.+)$/i);
  const prefixMatch = keyword.match(/^(high|medium|mid|low|高危|中危|低危|高|中|低)\s*[:：]\s*(.+)$/i);
  if (bracketMatch) {
    riskLevel = parseRiskLevel(bracketMatch[1]);
    keyword = bracketMatch[2].trim();
  } else if (prefixMatch) {
    riskLevel = parseRiskLevel(prefixMatch[1]);
    keyword = prefixMatch[2].trim();
  } else if (keyword.includes("|")) {
    const [keywordPart, levelPart, scorePart] = keyword.split("|").map((part) => part.trim());
    const parsedLevel = parseRiskLevel(levelPart);
    if (keywordPart && parsedLevel) {
      keyword = keywordPart;
      riskLevel = parsedLevel;
      const parsedScore = Number(scorePart);
      if (Number.isFinite(parsedScore) && parsedScore > 0) riskScore = parsedScore;
    }
  }

  if (!keyword) return null;
  return {
    keyword,
    normalized: keyword.toLowerCase(),
    riskLevel,
    riskScore
  };
}

function toKeywordRules(keywords: string[]): KeywordRule[] {
  const seen = new Set<string>();
  const rules: KeywordRule[] = [];

  for (const keyword of keywords) {
    const rule = parseKeywordRule(keyword);
    if (!rule || seen.has(rule.normalized)) continue;
    seen.add(rule.normalized);
    rules.push(rule);
  }

  return rules;
}

async function loadRules(app: App, customKeywords: string[] = []): Promise<KeywordRule[]> {
  const filePath = getRulesFilePath(app);
  const content = await fs.readFile(filePath, "utf8");
  const defaults = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return toKeywordRules([...defaults, ...customKeywords]);
}

async function assertCanContinue(controls?: ScanControls) {
  if (!controls) return;
  if (controls.isCancelled()) throw new ScanCancelledError();
  await controls.waitWhilePaused();
  if (controls.isCancelled()) throw new ScanCancelledError();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withFileSystemTimeout<T>(operation: Promise<T>, detail: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new FileSystemTimeoutError(detail)), FILESYSTEM_OPERATION_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createDiscoveryState(): DiscoveryState {
  return {
    discoveredFiles: 0,
    skippedPaths: 0,
    visitedEntries: 0,
    lastProgressAt: 0
  };
}

function discoveryMessage(state: DiscoveryState) {
  const skipped = state.skippedPaths > 0 ? `，已跳过 ${state.skippedPaths} 个无法访问或响应慢的路径` : "";
  return `正在枚举目标目录，已发现 ${state.discoveredFiles} 个文件${skipped}`;
}

function emitDiscoveryProgress(
  state: DiscoveryState,
  onProgress: (event: ScanProgressEvent) => void,
  currentFile?: string,
  force = false
) {
  const now = Date.now();
  if (!force && now - state.lastProgressAt < DISCOVERY_PROGRESS_INTERVAL_MS) return;
  state.lastProgressAt = now;
  onProgress({
    phase: "discovering",
    currentFile,
    scannedFiles: state.discoveredFiles,
    totalFiles: state.discoveredFiles,
    message: discoveryMessage(state),
    riskCounts: emptyRiskCounts()
  });
}

async function* walkFiles(
  root: string,
  state: DiscoveryState,
  onProgress: (event: ScanProgressEvent) => void,
  controls?: ScanControls
): AsyncGenerator<string> {
  await assertCanContinue(controls);
  emitDiscoveryProgress(state, onProgress, root, true);
  let rootStat;
  try {
    rootStat = await withFileSystemTimeout(fs.stat(root), `访问 ${root}`);
  } catch (error) {
    if (error instanceof ScanCancelledError) throw error;
    state.skippedPaths += 1;
    emitDiscoveryProgress(state, onProgress, root, true);
    return;
  }

  if (rootStat.isFile()) {
    state.discoveredFiles += 1;
    emitDiscoveryProgress(state, onProgress, root);
    yield root;
    return;
  }

  if (!rootStat.isDirectory()) return;

  let entries;
  try {
    emitDiscoveryProgress(state, onProgress, root, true);
    entries = await withFileSystemTimeout(fs.readdir(root, { withFileTypes: true }), `读取目录 ${root}`);
  } catch (error) {
    if (error instanceof ScanCancelledError) throw error;
    state.skippedPaths += 1;
    emitDiscoveryProgress(state, onProgress, root, true);
    return;
  }

  for (const entry of entries) {
    await assertCanContinue(controls);
    state.visitedEntries += 1;
    if (state.visitedEntries % EVENT_LOOP_YIELD_INTERVAL === 0) await delay(0);
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    emitDiscoveryProgress(state, onProgress, fullPath);

    if (entry.isDirectory()) {
      yield* walkFiles(fullPath, state, onProgress, controls);
      continue;
    }

    if (!entry.isFile()) continue;
    state.discoveredFiles += 1;
    emitDiscoveryProgress(state, onProgress, fullPath);
    yield fullPath;
  }
}

function extensionType(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace(".", "") || "unknown";
}

function emptyRiskCounts(): Record<RiskLevel, number> {
  return { high: 0, medium: 0, low: 0 };
}

function reportFormatLabel(options: ScanOptions): string {
  const formats = options.exportFormats.length > 0 ? options.exportFormats : ["pdf"];
  return formats.map((format) => format.toUpperCase()).join(" / ");
}

function scanFileName(filePath: string, rules: KeywordRule[]) {
  const fileName = path.basename(filePath);
  return buildMatches(fileName, rules, "filename").map((match) => ({
    ...match,
    excerpt: `文件名: ${fileName}`
  }));
}

function scanProgressMessage(filePath: string, includeContent: boolean) {
  const fileName = path.basename(filePath);
  if (!includeContent) return `正在检查文件名 ${fileName}`;
  if (detectImageFile(filePath)) return `正在 OCR 图片 ${fileName}`;
  return `正在扫描 ${fileName}`;
}

async function parseFile(filePath: string, rules: KeywordRule[], app: App, options: ScanOptions) {
  const ext = path.extname(filePath).toLowerCase();
  if (detectTextFile(filePath)) return scanTextFile(filePath, rules, app);
  if (options.includeOffice && OFFICE_EXTENSIONS.has(ext)) return parseOfficeFile(filePath, rules);
  if (options.includePdf && PDF_EXTENSIONS.has(ext)) return scanPdf(filePath, rules);
  if (options.includeImages && detectImageFile(filePath)) return scanImage(filePath, rules, app);
  if (!ext && await isLikelyTextFile(filePath)) return scanTextFile(filePath, rules, app);
  return null;
}

async function statFileForScan(filePath: string) {
  return withFileSystemTimeout(fs.stat(filePath), `读取文件信息 ${filePath}`);
}

function shouldScanContent(options: ScanOptions) {
  return (options.matchScope ?? "filenameAndContent") === "filenameAndContent";
}

export async function runScan({ app, options, reportsDir, onProgress, controls, createPdf }: RunScanContext): Promise<ScanReport> {
  const rules = await loadRules(app, options.customKeywords);
  const maxFileSizeBytes = options.maxFileSizeMb * 1024 * 1024;
  const discoveryState = createDiscoveryState();
  const includeContent = shouldScanContent(options);
  let scannedFiles = 0;

  onProgress({
    phase: "discovering",
    scannedFiles: 0,
    totalFiles: 0,
    message: "正在枚举目标目录中的可扫描文件",
    riskCounts: emptyRiskCounts()
  });

  const results: FileScanResult[] = [];
  const riskCounts = emptyRiskCounts();

  for (const target of options.targetPaths) {
    for await (const filePath of walkFiles(target, discoveryState, onProgress, controls)) {
      await assertCanContinue(controls);
      onProgress({
        phase: "scanning",
        currentFile: filePath,
        scannedFiles,
        totalFiles: Math.max(discoveryState.discoveredFiles, scannedFiles + 1),
        message: scanProgressMessage(filePath, includeContent),
        riskCounts: { ...riskCounts }
      });

      try {
        const nameMatches = scanFileName(filePath, rules);
        let parsed: Awaited<ReturnType<typeof parseFile>> = null;
        let stat;

        if (includeContent) {
          stat = await statFileForScan(filePath);
          if (stat.size <= maxFileSizeBytes) {
            parsed = await parseFile(filePath, rules, app, options);
          }
        } else if (nameMatches.length > 0) {
          stat = await statFileForScan(filePath).catch(() => undefined);
        }

        const matches = [...nameMatches, ...(parsed?.matches ?? [])];
        if (matches.length > 0) {
          const risk = assessRisk(matches);
          riskCounts[risk.level] += 1;

          results.push({
            filePath,
            fileType: extensionType(filePath),
            size: stat?.size ?? 0,
            matches,
            extractedText: parsed && parsed.matches.some((item) => item.source === "text") ? parsed.content : undefined,
            ocrText: parsed && parsed.matches.some((item) => item.source === "ocr") ? parsed.content : undefined,
            risk
          });
        }
      } catch (error) {
        if (error instanceof ScanCancelledError) throw error;
        onProgress({
          phase: "error",
          currentFile: filePath,
          scannedFiles: scannedFiles + 1,
          totalFiles: Math.max(discoveryState.discoveredFiles, scannedFiles + 1),
          message: `扫描失败: ${error instanceof Error ? error.message : "未知错误"}`,
          riskCounts: { ...riskCounts }
        });
      } finally {
        scannedFiles += 1;
      }
    }
  }

  const createdAt = new Date().toISOString();
  const reportBase = {
    id: `scan-${Date.now()}`,
    createdAt,
    options,
    summary: {
      totalFiles: discoveryState.discoveredFiles,
      scannedFiles,
      matchedFiles: results.length,
      riskCounts
    },
    results: results.sort((a, b) => b.matches.length - a.matches.length)
  };

  onProgress({
    phase: "reporting",
    scannedFiles,
    totalFiles: discoveryState.discoveredFiles,
    message: `正在生成 ${reportFormatLabel(options)} 报告`,
    riskCounts: { ...riskCounts }
  });

  const artifact = await generateReports(reportBase, reportsDir, { createPdf });
  const report: ScanReport = { ...reportBase, artifact };

  onProgress({
    phase: "completed",
    scannedFiles,
    totalFiles: discoveryState.discoveredFiles,
    message: "扫描完成，报告已生成",
    riskCounts: { ...riskCounts }
  });

  return report;
}
