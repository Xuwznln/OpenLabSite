/**
 * 收藏的设备状态指标：设备详情抽屉里点星收藏，总览页聚合展示。
 * 仅存 (deviceId, prop) 引用，实时值由展示方从 telemetry 读取。
 */

import { defineStore } from "pinia";
import { ref, watch } from "vue";

export interface PinnedMetric {
  deviceId: string;
  prop: string;
}

const STORAGE_KEY = "openlab:pinned-metrics";

function load(): PinnedMetric[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is PinnedMetric =>
        typeof item?.deviceId === "string" && typeof item?.prop === "string",
    );
  } catch {
    return [];
  }
}

export function metricKey(deviceId: string, prop: string): string {
  return `${deviceId}::${prop}`;
}

export const usePinnedMetricsStore = defineStore("pinned-metrics", () => {
  const pins = ref<PinnedMetric[]>(load());

  function isPinned(deviceId: string, prop: string): boolean {
    return pins.value.some((item) => item.deviceId === deviceId && item.prop === prop);
  }

  function toggle(deviceId: string, prop: string) {
    if (isPinned(deviceId, prop)) {
      pins.value = pins.value.filter(
        (item) => !(item.deviceId === deviceId && item.prop === prop),
      );
    } else {
      pins.value = [...pins.value, { deviceId, prop }];
    }
  }

  function remove(deviceId: string, prop: string) {
    pins.value = pins.value.filter(
      (item) => !(item.deviceId === deviceId && item.prop === prop),
    );
  }

  watch(
    pins,
    (value) => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
    },
    { deep: true },
  );

  return { pins, isPinned, toggle, remove };
});
