export type RiskLevel = "high" | "medium" | "low";
export type ReportFormat = "html" | "txt" | "pdf";
export type ScanMatchScope = "filename" | "filenameAndContent";

export interface KeywordRule {
  keyword: string;
  normalized: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
}

export interface MatchItem {
  keyword: string;
  excerpt: string;
  position: number;
  line?: number;
  column?: number;
  riskLevel?: RiskLevel;
  riskScore?: number;
  source: "filename" | "text" | "ocr";
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
}

export interface FileScanResult {
  filePath: string;
  fileType: string;
  size: number;
  matches: MatchItem[];
  extractedText?: string;
  ocrText?: string;
  risk: RiskAssessment;
}

export interface ScanSummary {
  totalFiles: number;
  scannedFiles: number;
  matchedFiles: number;
  riskCounts: Record<RiskLevel, number>;
}

export interface ScanProgressEvent {
  phase: "discovering" | "scanning" | "paused" | "reporting" | "completed" | "cancelled" | "error";
  currentFile?: string;
  scannedFiles: number;
  totalFiles: number;
  message: string;
  riskCounts: Record<RiskLevel, number>;
}

export interface ScanOptions {
  targetPaths: string[];
  maxFileSizeMb: number;
  matchScope: ScanMatchScope;
  includeImages: boolean;
  includeOffice: boolean;
  includePdf: boolean;
  exportFormats: ReportFormat[];
  customKeywords: string[];
}

export interface ReportArtifact {
  htmlPath?: string;
  txtPath?: string;
  pdfPath?: string;
  createdAt: string;
}

export interface ScanReport {
  id: string;
  createdAt: string;
  options: ScanOptions;
  summary: ScanSummary;
  results: FileScanResult[];
  artifact: ReportArtifact;
}

export interface RecentReport {
  id: string;
  createdAt: string;
  htmlPath?: string;
  txtPath?: string;
  pdfPath?: string;
}

export interface RuntimePaths {
  reportsDir: string;
  defaultTargets: string[];
}

export interface DesktopApi {
  chooseDirectories: () => Promise<string[]>;
  getRuntimePaths: () => Promise<RuntimePaths>;
  getRecentReports: () => Promise<RecentReport[]>;
  startScan: (options: ScanOptions) => Promise<ScanReport>;
  pauseScan: () => Promise<void>;
  resumeScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
  onScanProgress: (callback: (event: ScanProgressEvent) => void) => () => void;
  openPath: (targetPath: string) => Promise<void>;
}
