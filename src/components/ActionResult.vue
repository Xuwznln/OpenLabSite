<script setup lang="ts">
import { computed } from "vue";
import { NTag } from "naive-ui";
import { actionResultDisplay } from "../features/action-result";

const props = defineProps<{ info: Record<string, unknown>; errors: unknown[] }>();
const result = computed(() => actionResultDisplay(props.info, props.errors));
</script>

<template>
  <div class="small">
    <NTag v-if="result.tag" size="small" :bordered="false">{{ result.tag }}</NTag>
    <pre v-if="result.text !== ''" class="mono result-content" :class="{ err: result.isError }">{{ result.text }}</pre>
    <div v-else-if="!result.errors.length" class="dim">空返回值</div>
    <pre v-for="(error, index) in result.errors" :key="index" class="mono result-content err">{{ error }}</pre>
  </div>
</template>

<style scoped>
.result-content { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; margin: 6px 0; }
</style>
