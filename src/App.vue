<template>
  <div :class="{ dark: store.darkMode }" class="h-screen overflow-hidden">
    <div class="mx-auto grid h-full min-h-0 w-full max-w-[1440px] gap-3 p-3 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-4 xl:grid-cols-[236px_minmax(0,1fr)] 2xl:grid-cols-[252px_minmax(0,1fr)]">
      <SidebarNav @toggle-theme="store.darkMode = !store.darkMode" />

      <main class="scrollbar-thin grid min-h-0 min-w-0 auto-rows-max content-start gap-4 overflow-y-auto overflow-x-hidden py-1 pr-1">
        <section class="panel rounded-lg px-5 py-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0">
              <div class="text-base font-semibold text-slate-200">本地扫描套件</div>
              <div class="mt-1 text-xs text-slate-400">Enterprise local scan suite</div>
              <div class="mt-2 text-sm text-slate-300/70">
                纯本地执行，自动打包内置二进制。目标目录 {{ store.selectedTargets.length }} 个，报告目录 {{ store.reportsDir || "未初始化" }}。
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <button class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" @click="pickDirectories">
                <FolderOpen class="h-4 w-4" />
                选择目录
              </button>
              <button class="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-900" :disabled="store.isScanning" @click="startScan">
                <ScanLine class="h-4 w-4" />
                {{ store.isScanning ? "扫描中..." : "开始扫描" }}
              </button>
            </div>
          </div>
        </section>

        <HomeView
          v-if="store.currentView === 'home'"
          @pick-directories="pickDirectories"
          @scan="startScan"
          @open-report="openPath"
        />
        <ScanView
          v-else-if="store.currentView === 'scan'"
          :log-items="logItems"
          @scan="startScan"
          @pause="pauseScan"
          @resume="resumeScan"
          @cancel="cancelScan"
        />
        <ReportView v-else :report="store.activeReport" @open-path="openPath" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { FolderOpen, ScanLine } from "lucide-vue-next";
import SidebarNav from "@/components/SidebarNav.vue";
import HomeView from "@/views/HomeView.vue";
import ScanView from "@/views/ScanView.vue";
import ReportView from "@/views/ReportView.vue";
import { useAppStore } from "@/stores/appStore";
import type { ScanOptions, ScanProgressEvent } from "@shared/types";

const store = useAppStore();
const logItems = ref<Array<{ id: string; phase: string; message: string; time: string }>>([]);
const customKeywordsStorageKey = "sensitive-scanner:custom-keywords";
const maxLogItems = 80;
let cleanup: (() => void) | null = null;

function pushLog(event: ScanProgressEvent) {
  const isHighVolumePhase = event.phase === "scanning" || event.phase === "discovering";
  const shouldKeepHighVolumeLog =
    event.scannedFiles === 0 ||
    event.scannedFiles === event.totalFiles ||
    event.scannedFiles % 25 === 0;

  if (isHighVolumePhase && !shouldKeepHighVolumeLog) return;

  logItems.value.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    phase: event.phase,
    message: event.currentFile ? `${event.message} · ${event.currentFile}` : event.message,
    time: new Date().toLocaleTimeString()
  });

  if (logItems.value.length > maxLogItems) {
    logItems.value.splice(maxLogItems);
  }
}

async function bootstrap() {
  const runtime = await window.scannerApi.getRuntimePaths();
  store.setRuntime(runtime.reportsDir, runtime.defaultTargets);
  store.setRecentReports(await window.scannerApi.getRecentReports());
}

async function pickDirectories() {
  const paths = await window.scannerApi.chooseDirectories();
  if (paths.length > 0) {
    store.setTargets(paths);
  }
}

async function openPath(targetPath: string) {
  await window.scannerApi.openPath(targetPath);
}

function parseCustomKeywords(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

async function startScan() {
  if (store.isScanning) return;
  store.beginScan();
  logItems.value = [];
  try {
    const options: ScanOptions = {
      targetPaths: [...store.selectedTargets],
      maxFileSizeMb: Number(store.scanOptions.maxFileSizeMb) || 15,
      matchScope: store.scanOptions.matchScope,
      includeImages: Boolean(store.scanOptions.includeImages),
      includeOffice: Boolean(store.scanOptions.includeOffice),
      includePdf: Boolean(store.scanOptions.includePdf),
      exportFormats: store.scanOptions.exportFormats.length > 0 ? [...store.scanOptions.exportFormats] : ["pdf"],
      customKeywords: parseCustomKeywords(store.customKeywordsInput)
    };
    const report = await window.scannerApi.startScan(options);
    store.finishScan(report);
    store.setRecentReports(await window.scannerApi.getRecentReports());
  } catch (error) {
    store.isScanning = false;
    store.isPaused = false;
    pushLog({
      phase: error instanceof Error && error.message.includes("取消") ? "cancelled" : "error",
      scannedFiles: 0,
      totalFiles: 0,
      message: error instanceof Error ? error.message : "扫描启动失败",
      riskCounts: { high: 0, medium: 0, low: 0 }
    });
  }
}

async function pauseScan() {
  if (!store.isScanning || store.isPaused) return;
  store.pauseScan();
  await window.scannerApi.pauseScan();
}

async function resumeScan() {
  if (!store.isScanning || !store.isPaused) return;
  store.resumeScan();
  await window.scannerApi.resumeScan();
}

async function cancelScan() {
  if (!store.isScanning) return;
  store.cancelScan();
  await window.scannerApi.cancelScan();
}

watchEffect(() => {
  document.documentElement.dataset.theme = store.darkMode ? "dark" : "light";
});

onMounted(async () => {
  store.customKeywordsInput = localStorage.getItem(customKeywordsStorageKey) ?? "";
  await bootstrap();
  cleanup = window.scannerApi.onScanProgress((event) => {
    store.setProgress(event);
    if (event.phase === "paused") store.pauseScan();
    if (event.phase === "completed" || event.phase === "cancelled") store.cancelScan();
    pushLog(event);
  });
});

watch(
  () => store.customKeywordsInput,
  (value) => {
    localStorage.setItem(customKeywordsStorageKey, value);
  }
);

onUnmounted(() => {
  cleanup?.();
});
</script>
