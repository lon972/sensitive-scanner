import { defineStore } from "pinia";
import type { RecentReport, ScanOptions, ScanProgressEvent, ScanReport } from "@shared/types";

export const useAppStore = defineStore("app", {
  state: () => ({
    darkMode: true,
    currentView: "home" as "home" | "scan" | "report",
    reportsDir: "",
    defaultTargets: [] as string[],
    selectedTargets: [] as string[],
    recentReports: [] as RecentReport[],
    activeReport: null as ScanReport | null,
    isScanning: false,
    isPaused: false,
    progress: null as ScanProgressEvent | null,
    customKeywordsInput: "",
    scanOptions: {
      targetPaths: [],
      maxFileSizeMb: 15,
      matchScope: "filename",
      includeImages: false,
      includeOffice: true,
      includePdf: true,
      exportFormats: ["pdf"],
      customKeywords: []
    } as ScanOptions
  }),
  actions: {
    setRuntime(reportsDir: string, defaultTargets: string[]) {
      this.reportsDir = reportsDir;
      this.defaultTargets = defaultTargets;
      if (this.selectedTargets.length === 0) {
        this.selectedTargets = [...defaultTargets];
      }
      this.scanOptions.targetPaths = [...this.selectedTargets];
    },
    setTargets(targets: string[]) {
      this.selectedTargets = targets;
      this.scanOptions.targetPaths = [...targets];
    },
    setRecentReports(reports: RecentReport[]) {
      this.recentReports = reports;
    },
    setProgress(progress: ScanProgressEvent) {
      this.progress = progress;
    },
    beginScan() {
      this.isScanning = true;
      this.isPaused = false;
      this.currentView = "scan";
    },
    finishScan(report: ScanReport) {
      this.isScanning = false;
      this.isPaused = false;
      this.activeReport = report;
      this.currentView = "report";
    },
    pauseScan() {
      this.isPaused = true;
    },
    resumeScan() {
      this.isPaused = false;
    },
    cancelScan() {
      this.isScanning = false;
      this.isPaused = false;
    }
  }
});
