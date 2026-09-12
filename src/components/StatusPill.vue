<script setup lang="ts">
import { computed } from "vue";
import { statusMeta } from "../theme";

const props = defineProps<{
  status: string;
  /** 覆盖默认中文文案 */
  label?: string;
  size?: "small" | "medium";
}>();

const meta = computed(() => statusMeta(props.status));
</script>

<template>
  <span
    class="pill"
    :class="size === 'small' ? 'pill-small' : ''"
    :style="{ color: meta.color }"
  >
    <span class="dot" :style="{ background: meta.color }" />
    {{ label ?? meta.label }}
  </span>
</template>

<style scoped>
/* 克制的状态标识：色点 + 色字，不带底色块 */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 650;
  line-height: 20px;
  white-space: nowrap;
  letter-spacing: 0.01em;
}

.pill-small {
  font-size: 12px;
  line-height: 18px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
