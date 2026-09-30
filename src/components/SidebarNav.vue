<template>
  <aside class="panel flex h-full min-h-0 min-w-0 flex-col rounded-lg p-4">
    <div>
      <h1 class="text-xl font-semibold">敏感信息扫描</h1>
      <p class="mt-2 text-xs text-slate-400">SensitiveScanner</p>
    </div>

    <button
      class="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
      @click="$emit('toggle-theme')"
    >
      <span>
        <span class="block text-sm font-medium text-slate-200">界面主题</span>
        <span class="mt-0.5 block text-xs text-slate-400">{{ store.darkMode ? "深色模式" : "浅色模式" }}</span>
      </span>
      <span class="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs text-slate-200">
        {{ store.darkMode ? "ON" : "OFF" }}
      </span>
    </button>

    <nav class="mt-6 grid shrink-0 gap-2">
      <button
        v-for="item in items"
        :key="item.key"
        class="group rounded-lg px-3 py-2.5 text-left transition"
        :class="store.currentView === item.key ? 'bg-white/10 text-white shadow-glow' : 'bg-transparent text-slate-300 hover:bg-white/5'"
        @click="store.currentView = item.key"
      >
        <div class="text-sm font-medium">{{ item.label }}</div>
        <div class="mt-1 text-xs text-slate-400">{{ item.desc }}</div>
      </button>
    </nav>

    <div class="mt-auto hidden shrink-0 pt-6 text-xs leading-5 text-slate-400 lg:block">
      扫描与报告均在本机完成。
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useAppStore } from "@/stores/appStore";

defineEmits<{
  (event: "toggle-theme"): void;
}>();

const store = useAppStore();

const items = [
  { key: "home", label: "总览首页", desc: "目录、命中概览与最近报告" },
  { key: "scan", label: "扫描控制台", desc: "进度、实时日志与引擎状态" },
  { key: "report", label: "报告工作台", desc: "关键词过滤、导出与高亮细节" }
] as const;
</script>
