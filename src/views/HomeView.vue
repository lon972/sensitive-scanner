<template>
  <div class="grid min-w-0 gap-5">
    <section class="panel min-w-0 rounded-lg p-5">
      <div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-400">扫描总览</p>
          <h2 class="mt-2 text-2xl font-semibold leading-tight">本地敏感信息扫描控制台</h2>
          <p class="mt-2 text-sm leading-6 text-slate-300/75">选择目录、设置文件范围，然后生成可搜索的 HTML/TXT 审计报告。</p>
        </div>
        <div class="min-w-0 rounded-lg border border-cyan-300/10 bg-cyan-300/5 p-4">
          <div class="text-xs text-slate-400">扫描目标</div>
          <div class="mt-3 grid gap-2">
            <div v-for="target in store.selectedTargets" :key="target" class="safe-text rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
              {{ target }}
            </div>
          </div>
          <button class="mt-4 w-full rounded-lg bg-white px-3 py-2 font-medium text-slate-900 transition hover:bg-cyan-100" @click="$emit('pick-directories')">
            选择目录
          </button>
        </div>
      </div>
    </section>

    <section class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 xl:gap-4">
      <StatCard eyebrow="目标目录" :value="store.selectedTargets.length" hint="本次扫描范围" badge="目录" badge-class="bg-cyan-300/15 text-cyan-100" />
      <StatCard eyebrow="扫描文件" :value="summary.scannedFiles" hint="最近一次扫描文件数" badge="文件" badge-class="bg-sky-300/15 text-sky-100" />
      <StatCard eyebrow="命中文件" :value="summary.matchedFiles" hint="包含关键词的文件数" badge="命中" badge-class="bg-emerald-400/15 text-emerald-100" />
      <StatCard eyebrow="报告目录" :value="store.reportsDir || '--'" hint="默认 PDF，可追加 HTML/TXT" badge="打开" badge-class="bg-cyan-300/15 text-cyan-100" compact />
    </section>

    <section class="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
      <div class="panel min-w-0 rounded-lg p-5">
        <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h3 class="text-xl font-semibold">扫描参数</h3>
            <p class="mt-1 text-sm text-slate-400">支持目录递归、Office/PDF/OCR 开关与大文件过滤。</p>
          </div>
          <button class="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-900" @click="$emit('scan')">开始扫描</button>
        </div>
        <div class="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div class="min-w-0 rounded-lg border border-white/10 bg-white/5 p-4">
            <span class="text-sm text-slate-300">查找范围</span>
            <div class="mt-3 grid gap-2">
              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                <span>仅按文件名查找</span>
                <input v-model="store.scanOptions.matchScope" type="radio" value="filename" class="border-white/10 bg-transparent" />
              </label>
              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                <span>文件名 + 文件内容</span>
                <input v-model="store.scanOptions.matchScope" type="radio" value="filenameAndContent" class="border-white/10 bg-transparent" />
              </label>
            </div>
          </div>
          <label class="min-w-0 rounded-lg border border-white/10 bg-white/5 p-4">
            <span class="text-sm text-slate-300">最大文件体积 (MB)</span>
            <input v-model.number="store.scanOptions.maxFileSizeMb" type="number" min="1" class="mt-3 w-full rounded-lg border-white/10 bg-slate-950/60 text-white" />
            <span class="mt-2 block text-xs leading-5 text-slate-500">仅用于文件内容解析，文件名查找不受体积限制。</span>
          </label>
          <div class="grid min-w-0 gap-3 md:col-span-2 lg:grid-cols-3">
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <span>扫描 Office</span>
              <input v-model="store.scanOptions.includeOffice" :disabled="store.scanOptions.matchScope === 'filename'" type="checkbox" class="rounded border-white/10 bg-transparent disabled:opacity-40" />
            </label>
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <span>扫描 PDF</span>
              <input v-model="store.scanOptions.includePdf" :disabled="store.scanOptions.matchScope === 'filename'" type="checkbox" class="rounded border-white/10 bg-transparent disabled:opacity-40" />
            </label>
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <span>图片 OCR（较慢）</span>
              <input v-model="store.scanOptions.includeImages" :disabled="store.scanOptions.matchScope === 'filename'" type="checkbox" class="rounded border-white/10 bg-transparent disabled:opacity-40" />
            </label>
          </div>
        </div>
        <div class="mt-4 min-w-0 rounded-lg border border-white/10 bg-white/5 p-4">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 class="text-sm font-medium text-slate-200">导出格式</h4>
              <p class="mt-1 text-xs leading-5 text-slate-400">默认导出 PDF，可按归档需要追加 HTML 或 TXT。</p>
            </div>
            <span class="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">{{ exportFormatLabel }}</span>
          </div>
          <div class="mt-3 grid min-w-0 gap-3 sm:grid-cols-3">
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
              <span>HTML</span>
              <input v-model="store.scanOptions.exportFormats" type="checkbox" value="html" class="rounded border-white/10 bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
              <span>TXT</span>
              <input v-model="store.scanOptions.exportFormats" type="checkbox" value="txt" class="rounded border-white/10 bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
              <span>PDF</span>
              <input v-model="store.scanOptions.exportFormats" type="checkbox" value="pdf" class="rounded border-white/10 bg-transparent" />
            </label>
          </div>
        </div>
        <label class="mt-4 block rounded-lg border border-cyan-200/10 bg-cyan-200/[0.04] p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span class="text-sm font-medium text-slate-200">自定义关键词</span>
              <p class="mt-1 text-xs leading-5 text-slate-400">每行一个，或用逗号/分号分隔。本次扫描会与默认关键词合并。</p>
            </div>
            <span class="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">{{ customKeywordCount }} 个追加词</span>
          </div>
          <textarea
            v-model="store.customKeywordsInput"
            rows="4"
            spellcheck="false"
            placeholder="例如：供应商&#10;项目代号&#10;internal-only"
            class="mt-3 w-full resize-y rounded-lg border border-white/10 bg-slate-950/60 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/40"
          />
        </label>
      </div>

      <div class="panel min-w-0 rounded-lg p-5">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h3 class="text-xl font-semibold">最近报告</h3>
            <p class="mt-1 text-sm text-slate-400">点击可直接打开报告文件。</p>
          </div>
        </div>
        <div class="grid gap-3">
          <button
            v-for="report in store.recentReports"
            :key="report.id"
            class="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10"
            @click="openRecentReport(report)"
          >
            <div class="safe-text text-sm font-medium text-white">{{ report.id }}</div>
            <div class="safe-text mt-1 text-xs leading-5 text-slate-400">{{ reportPathLabel(report) }}</div>
          </button>
          <div v-if="store.recentReports.length === 0" class="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
            还没有生成报告，首次扫描后会出现在这里。
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import StatCard from "@/components/StatCard.vue";
import { useAppStore } from "@/stores/appStore";
import type { RecentReport } from "@shared/types";

const emit = defineEmits<{
  (event: "pick-directories"): void;
  (event: "scan"): void;
  (event: "open-report", path: string): void;
}>();

const store = useAppStore();

const summary = computed(() => store.activeReport?.summary ?? {
  totalFiles: 0,
  scannedFiles: 0,
  matchedFiles: 0,
  riskCounts: { high: 0, medium: 0, low: 0 }
});

const exportFormatLabel = computed(() => {
  const formats = store.scanOptions.exportFormats.length > 0 ? store.scanOptions.exportFormats : ["pdf"];
  return formats.map((format) => format.toUpperCase()).join(" / ");
});

watch(
  () => store.scanOptions.exportFormats.length,
  (length) => {
    if (length === 0) store.scanOptions.exportFormats = ["pdf"];
  }
);

function openRecentReport(report: RecentReport) {
  const targetPath = report.pdfPath ?? report.htmlPath ?? report.txtPath;
  if (targetPath) emit("open-report", targetPath);
}

function reportPathLabel(report: RecentReport) {
  return report.pdfPath ?? report.htmlPath ?? report.txtPath ?? "报告文件缺失";
}

const customKeywordCount = computed(() => {
  const seen = new Set<string>();
  return store.customKeywordsInput
    .split(/[\n,，;；]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    }).length;
});
</script>
