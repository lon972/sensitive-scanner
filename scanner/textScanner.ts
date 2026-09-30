import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";
import type { KeywordRule, MatchItem } from "../shared/types.js";

export const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".csv",
  ".tsv",
  ".json",
  ".yaml",
  ".yml",
  ".env",
  ".log",
  ".xml",
  ".svg",
  ".ini",
  ".conf",
  ".config",
  ".properties",
  ".toml",
  ".sql",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".css",
  ".scss",
  ".less",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat"
]);

function buildMatches(content: string, rules: KeywordRule[], source: "filename" | "text" | "ocr"): MatchItem[] {
  const matches: MatchItem[] = [];
  const seen = new Set<string>();
  const lineStarts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") lineStarts.push(i + 1);
  }

  function locate(index: number) {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid + 1;
      else high = mid - 1;
    }
    const lineIndex = Math.max(0, high);
    return {
      line: lineIndex + 1,
      column: index - lineStarts[lineIndex] + 1
    };
  }

  function addMatch(rule: KeywordRule, index: number, endIndex: number) {
    const key = `${source}:${rule.normalized}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);

    const location = locate(index);
    const excerptStart = Math.max(0, index - 40);
    const excerptEnd = Math.min(content.length, Math.max(endIndex, index + rule.keyword.length) + 60);
    matches.push({
      keyword: rule.keyword,
      excerpt: content.slice(excerptStart, excerptEnd).replace(/\s+/g, " ").trim(),
      position: index,
      line: source === "filename" ? undefined : location.line,
      column: source === "filename" ? undefined : location.column,
      riskLevel: rule.riskLevel,
      riskScore: rule.riskScore,
      source
    });
  }

  for (const rule of rules) {
    let start = 0;
    while (true) {
      const index = content.toLowerCase().indexOf(rule.normalized, start);
      if (index === -1) break;
      addMatch(rule, index, index + rule.keyword.length);
      start = index + rule.keyword.length;
    }
  }

  if (source === "ocr") {
    const compactIndexMap: number[] = [];
    let compactContent = "";
    for (let index = 0; index < content.length; index += 1) {
      if (/\s/.test(content[index])) continue;
      compactIndexMap.push(index);
      compactContent += content[index].toLowerCase();
    }

    for (const rule of rules) {
      const compactKeyword = rule.normalized.replace(/\s+/g, "");
      if (!compactKeyword) continue;

      let start = 0;
      while (true) {
        const compactIndex = compactContent.indexOf(compactKeyword, start);
        if (compactIndex === -1) break;
        const originalStart = compactIndexMap[compactIndex];
        const originalEnd = compactIndexMap[compactIndex + compactKeyword.length - 1] + 1;
        addMatch(rule, originalStart, originalEnd);
        start = compactIndex + compactKeyword.length;
      }
    }
  }

  return matches;
}

export async function readTextContent(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return buffer.toString("utf8");
}

export async function isLikelyTextFile(filePath: string): Promise<boolean> {
  const file = await fs.open(filePath, "r");
  try {
    const sample = Buffer.alloc(8192);
    const { bytesRead } = await file.read(sample, 0, sample.length, 0);
    if (bytesRead === 0) return true;
    const buffer = sample.subarray(0, bytesRead);
    if (buffer.includes(0)) return false;
    const decoded = buffer.toString("utf8");
    const replacementCount = [...decoded].filter((char) => char === "\uFFFD").length;
    return replacementCount / Math.max(decoded.length, 1) < 0.02;
  } finally {
    await file.close();
  }
}

export async function scanTextFile(filePath: string, rules: KeywordRule[], _app: App): Promise<{ content: string; matches: MatchItem[] }> {
  const content = await readTextContent(filePath);
  return {
    content,
    matches: buildMatches(content, rules, "text")
  };
}

export function detectTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export { buildMatches };
