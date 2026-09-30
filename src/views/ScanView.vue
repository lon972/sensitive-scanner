<template>
  <div class="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
    <section class="panel min-w-0 rounded-lg p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-400">实时扫描</p>
          <h2 class="mt-3 text-2xl font-semibold sm:text-3xl">扫描控制台</h2>
          <div class="mt-2 flex min-h-6 items-center gap-2 text-sm text-slate-400">
            <span class="stage-dot" :class="`stage-dot--${progress.phase}`"></span>
            <span class="stage-copy">{{ phaseSubtitle }}</span>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <button
            v-if="store.isScanning"
            class="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-slate-200"
            @click="store.isPaused ? $emit('resume') : $emit('pause')"
          >
            {{ store.isPaused ? "继续扫描" : "暂停扫描" }}
          </button>
          <button
            v-if="store.isScanning"
            class="danger-button rounded-lg px-3 py-2 text-sm font-medium"
            @click="$emit('cancel')"
          >
            取消扫描
          </button>
          <button class="w-fit rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900" :disabled="store.isScanning" @click="$emit('scan')">
            {{ store.isScanning ? "扫描进行中" : "重新开始" }}
          </button>
        </div>
      </div>

      <div class="mt-8">
        <div class="mb-3 flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span class="safe-text status-copy">{{ progress.message }}</span>
          <span class="status-counter shrink-0">{{ progress.scannedFiles }} / {{ progress.totalFiles }}</span>
        </div>
        <div class="progress-track h-3 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
          <div
            class="progress-fill h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300"
            :class="{ 'animate-pulse': store.isScanning && percent < 3 }"
            :style="{ width: `${displayPercent}%` }"
          ></div>
        </div>
      </div>

      <div class="mt-6 rounded-lg border border-white/10 bg-slate-950/50 p-4">
        <div class="text-xs text-slate-400">当前文件</div>
        <div class="safe-text status-copy mt-3 min-h-5 text-sm text-slate-200">{{ progress.currentFile || "等待扫描开始" }}</div>
      </div>
    </section>

    <section class="panel min-w-0 rounded-lg p-5">
      <div>
        <h3 class="text-xl font-semibold">实时日志</h3>
        <p class="mt-1 text-sm text-slate-400">以扫描阶段为主线，便于定位失败文件和性能瓶颈。</p>
      </div>
      <div class="scrollbar-thin mt-5 max-h-[min(540px,calc(100vh-280px))] min-h-[320px] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-slate-950/45 p-4">
        <div class="grid gap-3">
          <div v-for="item in logItems" :key="item.id" class="log-card min-w-0 rounded-lg border border-white/8 bg-white/[0.03] p-4">
            <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div class="phase-pill text-sm font-medium text-white">{{ phaseLabel(item.phase) }}</div>
              <div class="text-xs text-slate-500">{{ item.time }}</div>
            </div>
            <p class="safe-text mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300/80">{{ item.message }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "@/stores/appStore";

const props = defineProps<{
  logItems: Array<{ id: string; phase: string; message: string; time: string }>;
}>();

defineEmits<{
  (event: "scan"): void;
  (event: "pause"): void;
  (event: "resume"): void;
  (event: "cancel"): void;
}>();

const store = useAppStore();

const progress = computed(() => store.progress ?? {
  phase: "discovering",
  currentFile: "",
  scannedFiles: 0,
  totalFiles: 0,
  message: "准备就绪",
  riskCounts: { high: 0, medium: 0, low: 0 }
});

const percent = computed(() => {
  if (!progress.value.totalFiles) return 0;
  return Math.round((progress.value.scannedFiles / progress.value.totalFiles) * 100);
});

const displayPercent = computed(() => {
  if (!store.isScanning || !progress.value.totalFiles) return percent.value;
  return Math.max(percent.value, 2);
});

const phaseSubtitle = computed(() => {
  const labels: Record<string, string> = {
    discovering: "正在发现可扫描文件。",
    scanning: "正在处理当前文件。",
    paused: "扫描已暂停。",
    reporting: "正在整理扫描报告。",
    completed: "报告已经生成。",
    cancelled: "扫描已取消。",
    error: "扫描遇到错误。"
  };

  return labels[progress.value.phase] ?? "展示当前文件、扫描进度与引擎阶段。";
});

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    discovering: "发现文件",
    scanning: "扫描中",
    paused: "已暂停",
    reporting: "生成报告",
    completed: "已完成",
    cancelled: "已取消",
    error: "错误"
  };

  return labels[phase] ?? phase;
}
</script>
