import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pdf from "pdf-parse";
import fs from "node:fs/promises";
import type { App } from "electron";
import type { KeywordRule, MatchItem } from "../shared/types.js";
import { buildMatches } from "./textScanner.js";
import { getPlatformBinaryDir } from "./runtimePaths.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"]);
const OCR_TIMEOUT_MS = 20_000;
const runFile = promisify(execFile);

function getTesseractPath(app: App): string {
  const binary = process.platform === "win32" ? "tesseract.exe" : "tesseract";
  return path.join(getPlatformBinaryDir(app), binary);
}

function getTessdataDir(app: App): string {
  return path.join(getPlatformBinaryDir(app), "tessdata");
}

export async function scanPdf(filePath: string, rules: KeywordRule[]): Promise<{ content: string; matches: MatchItem[] }> {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdf(buffer);
  return {
    content: parsed.text,
    matches: buildMatches(parsed.text, rules, "text")
  };
}

async function recognizeImage(filePath: string, app: App, psm: number): Promise<string> {
  const { stdout } = await runFile(
    getTesseractPath(app),
    [
      filePath,
      "stdout",
      "-l",
      "eng+chi_sim",
      "--oem",
      "1",
      "--psm",
      String(psm),
      "--tessdata-dir",
      getTessdataDir(app)
    ],
    {
      timeout: OCR_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024
    }
  );

  return stdout;
}

export async function scanImage(filePath: string, rules: KeywordRule[], app: App): Promise<{ content: string; matches: MatchItem[] }> {
  const attempts: Array<{ psm: number; content: string; matches: MatchItem[] }> = [];
  for (const psm of [6]) {
    const content = await recognizeImage(filePath, app, psm);
    const matches = buildMatches(content, rules, "ocr");
    attempts.push({ psm, content, matches });
  }

  const bestAttempt = attempts.find((attempt) => attempt.matches.length > 0) ?? attempts[0];
  const content = attempts.length > 1
    ? attempts.map((attempt) => `[OCR psm ${attempt.psm}]\n${attempt.content}`.trim()).join("\n\n")
    : bestAttempt.content;

  return {
    content,
    matches: bestAttempt.matches
  };
}

export function detectImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
