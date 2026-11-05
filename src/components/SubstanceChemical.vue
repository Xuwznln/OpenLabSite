<script setup lang="ts">
/**
 * 内容物关联的化学品：名称、CAS、分子式、分子量，链接到化学品库条目。
 * 可编辑时提供关联 / 更换 / 解除（由父组件发 PUT data，只带改动那一份的 chemical_uuid）。
 */
import { computed } from "vue";
import { NButton } from "naive-ui";
import type { MaterialsV1Substance } from "@openlab/protocol";
import { chemicalPath, formatNumber } from "../features/chemicals";
import { substanceLink } from "../features/substance-chemicals";

const props = withDefaults(defineProps<{ substance: MaterialsV1Substance; editable?: boolean; busy?: boolean }>(), {
  editable: false,
  busy: false,
});
const emit = defineEmits<{ link: []; unlink: [] }>();
const link = computed(() => substanceLink(props.substance));
</script>

<template>
  <div class="substance-chemical">
    <template v-if="link.kind === 'linked'">
      <RouterLink class="chem-name" :to="chemicalPath(link.chemicalUuid)" title="在化学品库中查看">{{ link.summary.name }}</RouterLink>
      <span v-if="link.summary.cas" class="chem-chip mono" title="CAS">CAS {{ link.summary.cas }}</span>
      <span v-if="link.summary.molecular_formula" class="chem-chip mono" title="分子式">{{ link.summary.molecular_formula }}</span>
      <span v-if="link.summary.molecular_weight" class="chem-chip mono" title="分子量">{{ formatNumber(link.summary.molecular_weight) }} g/mol</span>
    </template>
    <template v-else-if="link.kind === 'deleted'">
      <RouterLink class="chem-deleted" :to="chemicalPath(link.chemicalUuid)" title="引用保留，化学品已被删除">关联的化学品已删除</RouterLink>
    </template>
    <span v-else-if="link.manual" class="chem-none" title="已手动解除：设备按名称上报不会再自动关联，需要时手动关联">已解除关联</span>
    <span v-else class="chem-none" title="按名称 / 别名 / CAS 唯一匹配到化学品时会自动关联">未关联化学品</span>
    <span v-if="props.editable" class="chem-actions">
      <NButton size="tiny" quaternary type="primary" :disabled="props.busy" @click="emit('link')">
        {{ link.kind === "unlinked" ? "关联化学品" : "更换" }}
      </NButton>
      <NButton v-if="link.kind !== 'unlinked'" size="tiny" quaternary :disabled="props.busy" @click="emit('unlink')">解除</NButton>
    </span>
  </div>
</template>

<style scoped>
.substance-chemical {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 12px;
}

.chem-name {
  color: var(--domain-accent);
  font-weight: 600;
  text-decoration: none;
}

.chem-name:hover {
  text-decoration: underline;
}

.chem-chip {
  padding: 0 6px;
  border-radius: 4px;
  background: var(--panel-soft);
  color: #4b5560;
  font-size: 11px;
  line-height: 18px;
}

.mono {
  font-family: var(--font-mono);
}

.chem-deleted {
  color: #b45309;
}

.chem-none {
  color: #9aa3ab;
}

.chem-actions {
  display: inline-flex;
  margin-left: auto;
}
</style>
