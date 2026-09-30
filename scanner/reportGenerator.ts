import fs from "node:fs/promises";
import path from "node:path";
import type { FileScanResult, MatchItem, ReportArtifact, ReportFormat, ScanReport } from "../shared/types.js";

interface GenerateReportsOptions {
  createPdf?: (html: string, pdfPath: string) => Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function highlightKeywords(excerpt: string, keywords: string[]): string {
  let result = escapeHtml(excerpt);
  for (const keyword of keywords) {
    const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(safe, "gi"), (match) => `<mark>${match}</mark>`);
  }
  return result;
}

function formatLocalTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function scannedTargetLines(report: Omit<ScanReport, "artifact">): string[] {
  const targets = report.options.targetPaths.length > 0 ? report.options.targetPaths : ["未选择目标目录"];
  return targets.map((target, index) => `${index + 1}. ${target}`);
}

function renderScannedTargets(report: Omit<ScanReport, "artifact">): string {
  return scannedTargetLines(report)
    .map((target) => `<li>${escapeHtml(target)}</li>`)
    .join("");
}

function sourceLabel(match: MatchItem): string {
  const column = match.column ? `，第 ${match.column} 列` : "";
  if (match.source === "filename") return "文件名";
  if (match.source === "ocr") return match.line ? `OCR 第 ${match.line} 行${column}` : "OCR 内容";
  return match.line ? `内容第 ${match.line} 行${column}` : "文件内容";
}

function issueLabel(match: MatchItem): string {
  return `问题位置：${sourceLabel(match)}`;
}

function renderRow(item: FileScanResult): string {
  const keywords = [...new Set(item.matches.map((match) => match.keyword))];
  const issueSummary = [...new Set(item.matches.map((match) => sourceLabel(match)))].slice(0, 4).join(" / ");
  const body = item.matches
    .map((match) => `<li><div class="hit-meta"><span class="pill">${escapeHtml(issueLabel(match))}</span><span class="keyword">关键词：${escapeHtml(match.keyword)}</span></div><div class="excerpt">${highlightKeywords(match.excerpt, [match.keyword])}</div></li>`)
    .join("");

  return `
    <details class="card" data-search="${escapeHtml(`${item.filePath} ${keywords.join(" ")} ${issueSummary}`.toLowerCase())}">
      <summary>
        <div>
          <h3>${escapeHtml(item.filePath)}</h3>
          <p>${escapeHtml(item.fileType)} · 命中位置：${escapeHtml(issueSummary || "未标注")} · 关键词：${escapeHtml(keywords.join(", "))}</p>
        </div>
        <div class="meta">
          <strong>${item.matches.length}</strong>
          <span>命中</span>
        </div>
      </summary>
      <ul>${body}</ul>
      ${item.ocrText ? `<section><h4>OCR</h4><pre>${escapeHtml(item.ocrText)}</pre></section>` : ""}
    </details>
  `;
}

function renderEmptyResult(report: Omit<ScanReport, "artifact">): string {
  return `
    <div class="empty-state">
      <h3>未发现敏感信息命中</h3>
      <p>本次扫描已在 ${escapeHtml(formatLocalTime(report.createdAt))} 完成，共扫描 ${report.summary.scannedFiles}/${report.summary.totalFiles} 个文件。</p>
      <p>扫描目录如下，可用于归档复核：</p>
      <ul class="target-list">${renderScannedTargets(report)}</ul>
    </div>
  `;
}

function normalizeReportFormats(formats: ReportFormat[] | undefined): ReportFormat[] {
  const selected = new Set<ReportFormat>(formats?.length ? formats : ["pdf"]);
  return [...selected];
}

function matchScopeLabel(report: Omit<ScanReport, "artifact">): string {
  return (report.options.matchScope ?? "filenameAndContent") === "filename" ? "仅文件名" : "文件名 + 文件内容";
}

export async function generateReports(
  report: Omit<ScanReport, "artifact">,
  reportsDir: string,
  options: GenerateReportsOptions = {}
): Promise<ReportArtifact> {
  await fs.mkdir(reportsDir, { recursive: true });

  const formats = normalizeReportFormats(report.options.exportFormats);
  const baseName = `report_${report.createdAt.replace(/[-T]/g, "_").replace(/\..+/, "").replace(/:/g, "_")}`;
  const htmlPath = path.join(reportsDir, `${baseName}.html`);
  const txtPath = path.join(reportsDir, `${baseName}.txt`);
  const pdfPath = path.join(reportsDir, `${baseName}.pdf`);

  const txt = [
    `SensitiveScanner Report`,
    `扫描时间: ${formatLocalTime(report.createdAt)}`,
    `已扫描目录:`,
    ...scannedTargetLines(report),
    `查找范围: ${matchScopeLabel(report)}`,
    `扫描文件数: ${report.summary.scannedFiles}/${report.summary.totalFiles}`,
    `命中文件数: ${report.summary.matchedFiles}`,
    report.results.length === 0 ? `扫描结果: 未发现敏感信息命中。本次扫描在以上目录下完成，共扫描 ${report.summary.scannedFiles}/${report.summary.totalFiles} 个文件。` : "",
    "",
    ...report.results.map((item) => [
      `[命中 ${item.matches.length}] ${item.filePath}`,
      `类型: ${item.fileType}`,
      `关键词: ${[...new Set(item.matches.map((match) => match.keyword))].join(", ")}`,
      ...item.matches.map((match) => `- ${issueLabel(match)} / 关键词: ${match.keyword}: ${match.excerpt}`),
      item.ocrText ? `OCR: ${item.ocrText}` : "",
      ""
    ].filter(Boolean).join("\n"))
  ].join("\n");

  const totalMatches = report.results.reduce((total, item) => total + item.matches.length, 0);
  const scannedTargets = renderScannedTargets(report);
  const html = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>SensitiveScanner Report</title>
      <style>
        :root { color-scheme: light; --ink:#18202a; --paper:#f5f2eb; --panel:#fffdf7; --line:#d8d0c3; --muted:#6b7280; --accent:#1d6f6f; --accent-soft:#dcebea; --mark:#f1c75b; }
        * { box-sizing:border-box; }
        body { margin:0; font-family:"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif; background:linear-gradient(135deg,#f7f3ea 0%,#ece7dc 100%); color:var(--ink); }
        .shell { max-width:1180px; margin:0 auto; padding:44px 28px 64px; }
        .masthead { border-top:6px solid var(--ink); background:var(--panel); box-shadow:0 18px 50px rgba(52,42,28,.12); padding:30px; margin-bottom:18px; }
        .kicker { margin:0 0 14px; color:var(--accent); font-size:12px; font-weight:700; letter-spacing:.28em; text-transform:uppercase; }
        h1 { margin:0; font-size:34px; letter-spacing:0; }
        .intro { margin:14px 0 0; color:var(--muted); line-height:1.8; }
        .layout { display:grid; grid-template-columns:minmax(0,1.7fr) 330px; gap:18px; align-items:start; }
        .panel, .card { background:var(--panel); border:1px solid var(--line); box-shadow:0 10px 30px rgba(52,42,28,.08); }
        .panel { padding:22px; }
        .section-title { margin:0 0 14px; font-size:15px; letter-spacing:.16em; text-transform:uppercase; color:#2d3845; }
        .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .stat { border:1px solid var(--line); background:#fbf8f0; padding:16px; }
        .stat small { color:var(--muted); }
        .stat h2 { margin:8px 0 0; font-size:28px; }
        .target-list { margin:0; padding:0; list-style:none; display:grid; gap:8px; }
        .target-list li { border-left:3px solid var(--accent); background:#f9f6ee; padding:10px 12px; color:#43505f; overflow-wrap:anywhere; }
        input { width:100%; border:1px solid var(--line); background:#fffaf0; color:var(--ink); padding:12px 14px; outline:none; }
        input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
        .toolbar { display:grid; gap:12px; margin-bottom:14px; }
        .list { display:grid; gap:12px; }
        summary { list-style:none; display:flex; justify-content:space-between; gap:16px; padding:18px; cursor:pointer; }
        summary::-webkit-details-marker { display:none; }
        summary > div:first-child { min-width:0; }
        summary h3 { overflow-wrap:anywhere; }
        summary p { color:var(--muted); line-height:1.6; margin:.35rem 0 0; }
        .meta { min-width:82px; text-align:right; color:var(--accent); }
        .meta strong { display:block; font-size:28px; }
        ul { margin:0; padding:0 20px 18px 20px; list-style:none; display:grid; gap:10px; }
        li { background:#fbf8f0; border:1px solid var(--line); padding:12px 14px; color:#4b5563; }
        .hit-meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:8px; }
        .keyword { color:var(--ink); font-size:12px; font-weight:700; }
        .excerpt { overflow-wrap:anywhere; line-height:1.7; }
        mark { background:rgba(241,199,91,.55); color:var(--ink); padding:0 2px; }
        .pill { display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; background:var(--accent-soft); color:#174e4e; font-size:12px; }
        pre { white-space:pre-wrap; background:#eee8dc; padding:16px; margin:0 20px 20px; color:#45505d; }
        .empty-state { border:1px dashed var(--line); background:#fbf8f0; padding:22px; color:#43505f; }
        .empty-state h3 { margin:0 0 10px; color:var(--ink); }
        .empty-state p { margin:8px 0; line-height:1.7; }
        @page { size:A4; margin:14mm; }
        @media (max-width:900px) { .layout, .stats { grid-template-columns:1fr; } }
        @media print { body { background:#fff; } .shell { padding:0; } .toolbar { display:none; } .panel, .card, .masthead { box-shadow:none; break-inside:avoid; } }
      </style>
    </head>
    <body>
      <div class="shell">
        <section class="masthead">
          <p class="kicker">SensitiveScanner Local Audit</p>
          <h1>本地敏感信息扫描报告</h1>
          <p class="intro">扫描时间 ${escapeHtml(formatLocalTime(report.createdAt))}。报告按扫描范围、命中概览和文件明细组织，便于归档、复核与后续处理。</p>
        </section>
        <section class="layout">
          <main class="panel">
            <h2 class="section-title">命中概览</h2>
            <div class="stats">
              <div class="stat"><small>扫描文件</small><h2>${report.summary.scannedFiles}/${report.summary.totalFiles}</h2></div>
              <div class="stat"><small>命中文件</small><h2>${report.summary.matchedFiles}</h2></div>
              <div class="stat"><small>命中总数</small><h2>${totalMatches}</h2></div>
            </div>
            <p class="intro">查找范围：${escapeHtml(matchScopeLabel(report))}</p>
          </main>
          <aside class="panel">
            <h2 class="section-title">已扫描目录</h2>
            <ul class="target-list">${scannedTargets}</ul>
          </aside>
        </section>
        <section class="panel" style="margin-top:18px">
          <h2 class="section-title">文件明细</h2>
            <div class="toolbar" style="grid-template-columns:1fr">
              <input id="search" placeholder="搜索路径、关键词、文件类型" />
            </div>
          <section class="list" id="list">${report.results.length > 0 ? report.results.map(renderRow).join("") : renderEmptyResult(report)}</section>
        </section>
      </div>
      <script>
        const search = document.getElementById("search");
        const cards = Array.from(document.querySelectorAll(".card"));
        const apply = () => {
          const q = search.value.trim().toLowerCase();
          cards.forEach((card) => {
            const hit = !q || card.dataset.search.includes(q);
            card.style.display = hit ? "" : "none";
          });
        };
        search.addEventListener("input", apply);
      </script>
    </body>
  </html>`;

  const artifact: ReportArtifact = {
    createdAt: report.createdAt
  };

  if (formats.includes("html")) {
    await fs.writeFile(htmlPath, html, "utf8");
    artifact.htmlPath = htmlPath;
  }

  if (formats.includes("txt")) {
    await fs.writeFile(txtPath, txt, "utf8");
    artifact.txtPath = txtPath;
  }

  if (formats.includes("pdf") && options.createPdf) {
    await options.createPdf(html, pdfPath);
    artifact.pdfPath = pdfPath;
  }

  return artifact;
}
