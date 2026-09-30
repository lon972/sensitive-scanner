<template>
  <section class="panel min-w-0 rounded-lg p-4">
    <p class="text-xs font-medium text-slate-400">{{ eyebrow }}</p>
    <div class="mt-4 flex justify-between gap-3" :class="compact ? 'flex-col items-start sm:flex-row sm:items-end' : 'items-end'">
      <div class="min-w-0 max-w-full">
        <h3 class="safe-text font-semibold leading-tight" :class="compact ? 'text-lg sm:text-xl' : 'text-3xl'">{{ value }}</h3>
        <p class="mt-2 text-sm text-slate-400">{{ hint }}</p>
      </div>
      <span class="shrink-0 rounded-md px-2 py-1 text-xs font-medium" :class="badgeClass">{{ badge }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow: string;
  value: string | number;
  hint: string;
  badge: string;
  badgeClass: string;
  compact?: boolean;
}>();
</script>
