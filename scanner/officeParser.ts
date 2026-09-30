import mammoth from "mammoth";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { KeywordRule, MatchItem } from "../shared/types.js";
import { buildMatches } from "./textScanner.js";

async function parseDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function parseXlsx(filePath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const lines: string[] = [];

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(values.map((cell) => (cell == null ? "" : String(cell))).join(" | "));
    });
  });

  return lines.join("\n");
}

async function parsePptx(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const chunks: string[] = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.file(slideFile)?.async("text");
    if (!xml) continue;
    const text = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
      .map((match) => match[1].replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"))
      .join(" ");
    if (text) chunks.push(text);
  }

  return chunks.join("\n");
}

export async function parseOfficeFile(filePath: string, rules: KeywordRule[]): Promise<{ content: string; matches: MatchItem[] }> {
  const ext = path.extname(filePath).toLowerCase();
  const content =
    ext === ".docx" ? await parseDocx(filePath) :
    ext === ".xlsx" ? await parseXlsx(filePath) :
    await parsePptx(filePath);

  return {
    content,
    matches: buildMatches(content, rules, "text")
  };
}
