<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NAlert, NButton, NFormItem, NModal, NSelect, NSpace, NText } from "naive-ui";
import { suggestSite, type SiteCandidate, type SiteBindingStatus } from "../features/site-bindings";

const props = defineProps<{
  field: string;
  value: unknown;
  candidates: SiteCandidate[];
  status: SiteBindingStatus;
  optional: boolean;
  loading: boolean;
  error: string;
  confirm: (value: string | null) => boolean;
}>();
const emit = defineEmits<{ refresh: [] }>();
const show = ref(false);
const owner = ref<string | null>(null);
const selected = ref<string | null>(null);
const ownerOptions = computed(() => [...new Map(props.candidates.map((site) => [site.ownerUuid,
  { value: site.ownerUuid, label: `${site.ownerName} · ${site.ownerUuid.slice(0, 8)}` }])).values()]);
const siteOptions = computed(() => props.candidates.filter((site) => site.ownerUuid === owner.value));
const current = computed(() => props.candidates.find((site) => site.value === props.value));
const canConfirm = computed(() => !props.loading && !props.error && siteOptions.value.some((site) => site.value === selected.value));

function preselect() {
  const suggested = suggestSite(props.value, props.candidates);
  owner.value = suggested?.ownerUuid ?? (ownerOptions.value.length === 1 ? ownerOptions.value[0].value : null);
  selected.value = suggested?.value ?? null;
}
function open() { preselect(); show.value = true; }
function selectOwner(value: string | null) {
  owner.value = value;
  selected.value = suggestSite(props.value, siteOptions.value)?.value ?? null;
}
function confirm() {
  if (canConfirm.value && selected.value && props.confirm(selected.value)) show.value = false;
}
// 目录发生变化只保留仍有效的草稿；绝不在拉取结束时直接写入参数。
watch(() => props.candidates, () => {
  if (!show.value) return;
  if (!ownerOptions.value.some((item) => item.value === owner.value)) preselect();
  if (!siteOptions.value.some((item) => item.value === selected.value)) selected.value = null;
});
</script>

<template>
  <div class="site-binding">
    <NText :type="status === 'bound' ? 'success' : 'warning'">
      {{ !value && optional ? '未指定 Site，使用父级默认排布（可选）' : status === 'bound' ? `已绑定：${current?.label}` : status === 'unavailable' ? '待校验：Site 目录尚不可用' :
        status === 'invalid' ? '原绑定已失效，请重新确认' : `待确认：${value || '未指定 Site'}（默认值不等于已绑定）` }}
    </NText>
    <NSpace :size="6">
      <NButton size="small" secondary @click="open">{{ status === 'bound' ? '更改绑定' : '绑定物料与 Site' }}</NButton>
      <NButton size="small" quaternary :loading="loading" @click="emit('refresh')">刷新</NButton>
      <NButton v-if="value" size="small" quaternary @click="props.confirm(null)">清空</NButton>
    </NSpace>
    <NModal v-model:show="show" preset="card" :title="`确认 ${field} 的物料与 Site`" style="width: min(520px, 92vw)">
      <NAlert type="info" :bordered="false" style="margin-bottom: 16px">
        默认值 {{ value || '（空）' }} 仅作预填。请选择实际物料及槽位并确认；此操作不会创建或搬动物料。
      </NAlert>
      <NAlert v-if="error || (!loading && !candidates.length)" type="warning" :bordered="false" style="margin-bottom: 12px">
        {{ error || '目标物料/设备下没有可选 Site；请检查物料是否已登记，以及目标父级是否填写正确。' }}
      </NAlert>
      <NFormItem label="目标物料">
        <NSelect :value="owner" :options="ownerOptions" :loading="loading" filterable clearable placeholder="选择拥有 Site 的实际物料" @update:value="selectOwner" />
      </NFormItem>
      <NFormItem label="Site">
        <NSelect v-model:value="selected" :options="siteOptions.map(site => ({ label: site.label, value: site.value }))" :disabled="!owner" :loading="loading" filterable placeholder="请选择目标物料上的 Site" />
      </NFormItem>
      <p v-if="selected" class="site-identity">Site UUID：<code>{{ selected }}</code></p>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="show = false">取消，保留原值</NButton>
          <NButton type="primary" :disabled="!canConfirm" @click="confirm">确认绑定</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.site-binding { display: grid; gap: 8px; font-size: 12px; }
.site-identity { font-size: 12px; overflow-wrap: anywhere; }
</style>
