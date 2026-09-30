<template>
  <div class="grid min-w-0 gap-5">
    <section class="panel rounded-lg p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-400">报告复核</p>
          <h2 class="mt-3 text-3xl font-semibold">报告工作台</h2>
          <p class="mt-2 text-sm text-slate-400">支持关键词搜索、HTML/TXT 导出与高亮查看。</p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <button v-if="report?.artifact.txtPath" class="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm" @click="$emit('open-path', report.artifact.txtPath)">
            导出 TXT
          </button>
          <button v-if="report?.artifact.pdfPath" class="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm" @click="$emit('open-path', report.artifact.pdfPath)">
            导出 PDF
          </button>
          <button v-if="report?.artifact.htmlPath" class="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900" @click="$emit('open-path', report.artifact.htmlPath)">
            导出 HTML
          </button>
        </div>
      </div>

      <div class="mt-6 grid gap-4">
        <input v-model="search" class="rounded-lg border-white/10 bg-slate-950/60 text-white" placeholder="搜索路径、文件类型、关键词" />
      </div>
    </section>

    <section v-if="report" class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      <div class="panel rounded-lg p-4">
        <div class="text-xs text-slate-400">扫描时间</div>
        <div class="mt-3 text-lg font-semibold">{{ formatLocalTime(report.createdAt) }}</div>
      </div>
      <div class="panel rounded-lg p-4">
        <div class="text-xs text-slate-400">扫描文件</div>
        <div class="mt-3 text-3xl font-semibold">{{ report.summary.scannedFiles }}/{{ report.summary.totalFiles }}</div>
      </div>
      <div class="panel rounded-lg p-4">
        <div class="text-xs text-slate-400">命中文件</div>
        <div class="mt-3 text-3xl font-semibold">{{ report.summary.matchedFiles }}</div>
      </div>
      <div class="panel rounded-lg p-4">
        <div class="text-xs text-slate-400">命中总数</div>
        <div class="mt-3 text-3xl font-semibold">{{ totalMatches }}</div>
      </div>
    </section>

    <section v-if="report" class="min-w-0">
      <ReportList :items="report.results" :search="search" />
    </section>

    <section v-else class="panel rounded-lg p-10 text-center text-slate-400">
      扫描完成后，最新报告会显示在这里。
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ScanReport } from "@shared/types";
import ReportList from "@/components/ReportList.vue";

const props = defineProps<{
  report: ScanReport | null;
}>();

defineEmits<{
  (event: "open-path", path: string): void;
}>();

const search = ref("");
const totalMatches = computed(() => props.report?.results.reduce((total, item) => total + item.matches.length, 0) ?? 0);

function formatLocalTime(value: string) {
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
</script>
