<template>
  <div class="grid min-w-0 gap-4">
    <article
      v-for="item in filtered"
      :key="`${item.filePath}-${item.matches.length}`"
      class="panel min-w-0 rounded-lg border-l-4 border-l-cyan-300/70 p-4"
    >
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <h3 class="safe-text text-lg font-semibold leading-snug">{{ item.filePath }}</h3>
          <p class="mt-1 text-sm text-slate-400">{{ item.fileType }} · {{ item.matches.length }} 处命中</p>
        </div>
        <div class="rounded-lg bg-white/5 px-3 py-2 text-right">
          <div class="text-xs text-slate-400">命中</div>
          <div class="text-2xl font-semibold">{{ item.matches.length }}</div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <span v-for="keyword in uniqKeywords(item)" :key="keyword" class="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
          {{ keyword }}
        </span>
      </div>

      <div class="mt-4 grid gap-3">
        <div v-for="match in item.matches" :key="`${match.keyword}-${match.position}-${match.source}`" class="min-w-0 rounded-lg bg-slate-950/50 p-4 text-sm text-slate-200/90">
          <div class="safe-text mb-2 text-xs text-slate-400">{{ sourceLabel(match) }} · {{ match.keyword }}</div>
          <p class="safe-text leading-6" v-html="highlight(match.excerpt, match.keyword)"></p>
        </div>
      </div>

      <details v-if="item.ocrText" class="mt-4 rounded-lg border border-white/10 bg-white/[0.03]">
        <summary class="cursor-pointer px-4 py-3 text-sm text-slate-200">查看 OCR 原文</summary>
        <pre class="safe-text whitespace-pre-wrap px-4 pb-4 text-xs text-slate-400">{{ item.ocrText }}</pre>
      </details>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FileScanResult, MatchItem } from "@shared/types";

const props = defineProps<{
  items: FileScanResult[];
  search: string;
}>();

const filtered = computed(() => {
  const q = props.search.trim().toLowerCase();
  return props.items.filter((item) => {
    const searchBlob = `${item.filePath} ${item.fileType} ${item.matches.map((m) => m.keyword).join(" ")}`.toLowerCase();
    const matchSearch = !q || searchBlob.includes(q);
    return matchSearch;
  });
});

function uniqKeywords(item: FileScanResult) {
  return [...new Set(item.matches.map((match) => match.keyword))];
}

function sourceLabel(match: MatchItem) {
  const column = match.column ? `，第 ${match.column} 列` : "";
  if (match.source === "filename") return "文件名";
  if (match.source === "ocr") return match.line ? `OCR 第 ${match.line} 行${column}` : "OCR 内容";
  return match.line ? `内容第 ${match.line} 行${column}` : "文件内容";
}

function highlight(text: string, keyword: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(safe, "gi"), (match) => `<mark class="rounded bg-amber-300/30 px-1 text-white">${match}</mark>`);
}
</script>
