<script setup lang="ts">
/**
 * 全局运行坞：有工作流在跑时悬浮在底部（除控制台外的所有页面）。
 *
 * 类似播放器/CI 流水线的常驻感——不管在哪个页面，实验室「正在做什么」
 * 一眼可见，点击直达运行详情。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSchedulerStore } from "../stores/scheduler";

const route = useRoute();
const router = useRouter();
const sched = useSchedulerStore();

const activeRuns = computed(() => sched.activeTasks);

const visible = computed(() => activeRuns.value.length > 0 && route.path !== "/");

function progressOf(taskUuid: string): number {
  const jobs = sched.jobsByTask[taskUuid] ?? [];
  if (!jobs.length) return 0;
  return Math.round(
    (jobs.filter((job) => ["succeeded", "skipped"].includes(job.status)).length /
      jobs.length) *
      100,
  );
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 12)}…` : id;
}
</script>

<template>
  <Transition name="dock">
    <div v-if="visible" class="dock">
      <span class="dock-live"><span class="dock-live-dot" />RUNNING</span>
      <button
        v-for="wf in activeRuns.slice(0, 4)"
        :key="wf.uuid"
        class="dock-run"
        :title="wf.uuid"
        @click="router.push(`/workflow-tasks/${encodeURIComponent(wf.uuid)}`)"
      >
        <span class="dock-id mono">{{ shortId(wf.uuid) }}</span>
        <span class="dock-bar">
          <span class="dock-fill" :style="{ width: `${progressOf(wf.uuid)}%` }" />
        </span>
        <span class="dock-pct display-num">{{ progressOf(wf.uuid) }}%</span>
      </button>
      <button
        v-if="activeRuns.length > 4"
        class="dock-more"
        @click="router.push('/workflows')"
      >
        +{{ activeRuns.length - 4 }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.dock {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(12, 16, 20, 0.94);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 8px 16px;
  box-shadow: 0 16px 40px -12px rgba(12, 16, 20, 0.6);
  max-width: calc(100vw - 48px);
  overflow-x: auto;
}

.dock-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #22c47e;
  flex-shrink: 0;
}

.dock-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c47e;
  animation: dock-blink 1.4s ease-in-out infinite;
}

@keyframes dock-blink {
  50% {
    opacity: 0.3;
  }
}

.dock-run {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.07);
  border: none;
  border-radius: 999px;
  padding: 5px 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.dock-run:hover {
  background: rgba(255, 255, 255, 0.14);
}

.dock-id {
  font-size: 11px;
  font-weight: 600;
  color: #d5dae0;
}

.dock-bar {
  width: 64px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.dock-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: #2e5bff;
  transition: width 0.5s ease;
}

.dock-pct {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.dock-more {
  border: none;
  background: rgba(255, 255, 255, 0.07);
  color: #d5dae0;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.dock-enter-active,
.dock-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.dock-enter-from,
.dock-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
