<script setup lang="ts">
/**
 * 命令面板（⌘K / Ctrl+K）：键盘优先的全局入口。
 *
 * 聚合四类可执行项：页面跳转 / 快捷操作（新建运行、扫码、触发重排）/
 * 在线设备 / 进行中的运行。打开时惰性拉取设备列表。
 */
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { NIcon } from "naive-ui";
import {
  AlertCircleOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  CalculatorOutline,
  ColorWandOutline,
  CubeOutline,
  GitNetworkOutline,
  HardwareChipOutline,
  LayersOutline,
  MapOutline,
  PauseCircleOutline,
  PlayOutline,
  EyeOutline,
  PulseOutline,
  ReturnDownBackOutline,
  ScanOutline,
  ServerOutline,
  SpeedometerOutline,
  TerminalOutline,
  TimeOutline,
} from "@vicons/ionicons5";
import type { Component } from "vue";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";
import { useSchedulerStore } from "../stores/scheduler";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void; (e: "scan"): void }>();

const router = useRouter();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const sched = useSchedulerStore();

const query = ref("");
const selected = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const devices = ref<string[]>([]);

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: Component;
  run: () => void;
}

const pages = computed<{ to: string; label: string; icon: Component }[]>(() => [
  { to: "/", label: domain.config.nav.console, icon: TerminalOutline },
  { to: "/devices", label: domain.config.nav.devices, icon: HardwareChipOutline },
  { to: "/inventory", label: domain.config.nav.inventory, icon: CubeOutline },
  { to: "/lab", label: domain.config.nav.lab, icon: MapOutline },
  { to: "/monitor", label: domain.config.nav.monitor, icon: EyeOutline },
  { to: "/workflows", label: domain.config.nav.workflows, icon: GitNetworkOutline },
  { to: "/editor", label: domain.config.nav.editor, icon: ColorWandOutline },
  { to: "/timeline", label: domain.config.nav.timeline, icon: PulseOutline },
  { to: "/error-decisions", label: domain.config.nav["error-decisions"], icon: AlertCircleOutline },
  { to: "/status-incidents", label: domain.config.nav["status-incidents"], icon: PauseCircleOutline },
  { to: "/history", label: domain.config.nav.history, icon: TimeOutline },
  { to: "/registry", label: domain.config.nav.registry, icon: LayersOutline },
  { to: "/system", label: domain.config.nav.system, icon: SpeedometerOutline },
  { to: "/data", label: domain.config.nav.entities, icon: ServerOutline },
  // 领域工具是学科专属入口，通用模式下不出现
  ...(domain.activeId === "general"
    ? []
    : [{ to: "/toolkit", label: domain.config.nav.toolkit, icon: CalculatorOutline }]),
]);

function close() {
  emit("update:show", false);
}

const allItems = computed<PaletteItem[]>(() => {
  const items: PaletteItem[] = [];

  items.push(
    {
      id: "act:new-run",
      group: "操作",
      label: "打开 Workflow 编排草稿",
      hint: "本地草稿",
      icon: ColorWandOutline,
      run: () => void router.push("/editor"),
    },
    {
      id: "act:scan",
      group: "操作",
      label: "扫码枪录入物料",
      hint: "扫码直达",
      icon: ScanOutline,
      run: () => emit("scan"),
    },
  );

  for (const p of pages.value) {
    items.push({
      id: `page:${p.to}`,
      group: "页面",
      label: p.label,
      icon: p.icon,
      run: () => void router.push(p.to),
    });
  }

  for (const wf of sched.activeTasks) {
    items.push({
      id: `run:${wf.uuid}`,
      group: "进行中的运行",
      label: wf.uuid,
      hint: "查看",
      icon: PlayOutline,
      run: () => void router.push(`/workflow-tasks/${encodeURIComponent(wf.uuid)}`),
    });
  }

  for (const dev of devices.value) {
    items.push({
      id: `dev:${dev}`,
      group: "在线设备",
      label: dev,
      hint: "设备",
      icon: HardwareChipOutline,
      run: () => void router.push("/devices"),
    });
  }

  return items;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return allItems.value;
  return allItems.value.filter(
    (it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q),
  );
});

const grouped = computed(() => {
  const map = new Map<string, PaletteItem[]>();
  for (const it of filtered.value) {
    const arr = map.get(it.group) ?? [];
    arr.push(it);
    map.set(it.group, arr);
  }
  return [...map.entries()];
});

function flatIndexOf(item: PaletteItem): number {
  return filtered.value.indexOf(item);
}

function runSelected() {
  const item = filtered.value[selected.value];
  if (!item) return;
  close();
  item.run();
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    selected.value = Math.min(selected.value + 1, filtered.value.length - 1);
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    selected.value = Math.max(selected.value - 1, 0);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    runSelected();
  } else if (ev.key === "Escape") {
    close();
  }
}

watch(query, () => (selected.value = 0));

watch(
  () => props.show,
  async (show) => {
    if (!show) return;
    query.value = "";
    selected.value = 0;
    await nextTick();
    inputRef.value?.focus();
    // 惰性拉取 runtime.v1 在线执行路由；失败时静默降级。
    try {
      const endpoints = await conn.api.domains.runtimeV1.endpoints();
      devices.value = [...new Set(
        endpoints
          .filter((endpoint) => endpoint.state === "online")
          .flatMap((endpoint) => endpoint.device_routes)
          .filter((route) => route.enabled && route.selected)
          .map((route) => route.device_uuid),
      )];
    } catch {
      devices.value = [];
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="show" class="palette-mask" @click.self="close">
        <div class="palette" role="dialog" aria-label="命令面板">
          <div class="palette-input-row">
            <NIcon size="17" class="palette-glass"><TerminalOutline /></NIcon>
            <input
              ref="inputRef"
              v-model="query"
              class="palette-input"
              placeholder="输入命令、页面、设备或运行 ID…"
              @keydown="onKeydown"
            />
            <kbd class="palette-esc">esc</kbd>
          </div>

          <div class="palette-list">
            <template v-for="[group, items] in grouped" :key="group">
              <div class="palette-group">{{ group }}</div>
              <button
                v-for="item in items"
                :key="item.id"
                class="palette-item"
                :class="{ selected: flatIndexOf(item) === selected }"
                @mouseenter="selected = flatIndexOf(item)"
                @click="runSelected()"
              >
                <NIcon size="15" class="palette-icon"><component :is="item.icon" /></NIcon>
                <span class="palette-label">{{ item.label }}</span>
                <span v-if="item.hint" class="palette-hint mono">{{ item.hint }}</span>
              </button>
            </template>
            <div v-if="!filtered.length" class="palette-none">没有匹配项</div>
          </div>

          <div class="palette-foot">
            <span><kbd><NIcon :size="10"><ArrowUpOutline /></NIcon></kbd><kbd><NIcon :size="10"><ArrowDownOutline /></NIcon></kbd> 选择</span>
            <span><kbd><NIcon :size="10"><ReturnDownBackOutline /></NIcon></kbd> 执行</span>
            <span><kbd>esc</kbd> 关闭</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(12, 16, 20, 0.45);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  padding-top: 14vh;
}

.palette {
  width: min(580px, calc(100vw - 40px));
  max-height: 60vh;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 16px;
  box-shadow: 0 24px 64px -16px rgba(12, 16, 20, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  align-self: flex-start;
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0eee9;
}

.palette-glass {
  color: #2e5bff;
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  font-family: inherit;
  color: #101418;
  background: transparent;
}

.palette-input::placeholder {
  color: #a6acb5;
}

.palette-esc {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #6e7580;
  background: #f1f0ec;
  border: 1px solid #dedbd4;
  border-radius: 5px;
  padding: 2px 6px;
}

.palette-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 10px;
}

.palette-group {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a6acb5;
  padding: 10px 10px 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 9px 10px;
  font-size: 13.5px;
  color: #3d4650;
  cursor: pointer;
  text-align: left;
}

.palette-item.selected {
  background: #f1f4ff;
  color: #101418;
}

.palette-item.selected .palette-icon {
  color: #2e5bff;
}

.palette-icon {
  color: #a6acb5;
  flex-shrink: 0;
}

.palette-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-hint {
  font-size: 10.5px;
  color: #a6acb5;
}

.palette-none {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: #a6acb5;
}

.palette-foot {
  display: flex;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid #f0eee9;
  font-size: 11.5px;
  color: #6e7580;
}

.palette-foot kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 10px;
  background: #f1f0ec;
  border: 1px solid #dedbd4;
  border-radius: 4px;
  padding: 1px 4px;
  margin-right: 3px;
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.16s ease;
}

.palette-enter-active .palette,
.palette-leave-active .palette {
  transition: transform 0.16s ease;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .palette,
.palette-leave-to .palette {
  transform: translateY(-8px) scale(0.98);
}
</style>
