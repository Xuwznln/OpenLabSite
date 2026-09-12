<script setup lang="ts">
defineProps<{
  /** 小号大写字距 overline（如 LAB CONTROL） */
  overline?: string;
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <div class="page-header">
    <div class="titles">
      <span v-if="overline" class="overline">{{ overline }}</span>
      <h1 class="title">{{ title }}</h1>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    </div>
    <div class="actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
/* 吸顶：内容在 stage-body 里滚动时标题与操作区保持可见 */
.page-header {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin: 0 -6px 12px;
  padding: 2px 6px 10px;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.titles {
  min-width: 240px;
}

.overline {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #a6acb5;
  margin-bottom: 4px;
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: #101418;
}

.subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #6e7580;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
