<script setup lang="ts">
/** 在原定义上补全参数；保留整图的节点身份、连线与元数据，不克隆成另一条流程。 */
import { computed, ref, shallowRef, watch } from "vue";
import { NAlert, NButton, NInput, NModal, NSelect, NSpace, useMessage } from "naive-ui";
import type { BackendWorkflowGraph, JsonObject } from "@openlab/protocol";
import { useConnectionStore } from "../stores/connection";
import { useSiteBindingsStore } from "../stores/site-bindings";
import { useWorkflowValidationStore } from "../stores/workflow-validation";
import { useActionParamForm } from "../features/action-param-form";
import { describeError } from "../features/errors";
import type { SiteBindings } from "../features/site-bindings";
import ActionParamFields from "./ActionParamFields.vue";

const props = defineProps<{ workflowUuid: string }>();
const emit = defineEmits<{ close: []; saved: [graph: BackendWorkflowGraph] }>();
const conn = useConnectionStore();
const sites = useSiteBindingsStore();
const validation = useWorkflowValidationStore();
const message = useMessage();
const graph = shallowRef<BackendWorkflowGraph | null>(null);
const selected = ref("");
const busy = ref(false);
const failure = ref("");
let generation = 0;
const node = computed(() => graph.value?.nodes.find((item) => item.uuid === selected.value));
const readiness = computed(() => graph.value ? validation.inspect(graph.value) : null);
const device = computed(() => String(node.value?.meta_data?.target_device_id ?? ""));
const action = computed(() => node.value?.action_name ?? "");
const paramJson = ref("{}");
function updateNode(patch: Partial<BackendWorkflowGraph["nodes"][number]>) {
  if (!graph.value || !node.value) return;
  // shallowRef 下必须替换节点身份；原地改再 triggerRef 会使依赖 node 的 computed 仍读旧确认记录。
  graph.value = { ...graph.value, nodes: graph.value.nodes.map((item) => item.uuid === selected.value ? { ...item, ...patch } : item) };
}
function writeParam() {
  updateNode({ param: JSON.parse(paramJson.value) as JsonObject });
}
watch(paramJson, () => { try { writeParam(); } catch { /* JSON 草稿允许暂时未完成，保存时报告错误。 */ } });
const form = useActionParamForm({ api: () => conn.api, device, action, paramJson,
  active: () => Boolean(props.workflowUuid), siteDirectory: sites,
  siteBindings: computed({
    get: () => (node.value?.meta_data?.site_bindings ?? {}) as unknown as SiteBindings,
    set: (bindings) => updateNode({ meta_data: { ...node.value?.meta_data, site_bindings: bindings as unknown as JsonObject } }),
  }),
  siteOwners: () => (node.value?.meta_data?.site_binding_owners ?? {}) as Record<string, string>,
  onParamWritten: writeParam, onError: (text) => message.error(text),
});
const nodeOptions = computed(() => (graph.value?.nodes ?? []).filter((item) => item.action_name && !item.disabled)
  .map((item) => {
    const count = readiness.value?.issues.find((issue) => issue.nodeId === item.uuid)?.entries.length ?? 0;
    return { value: item.uuid, label: `${item.name} · ${readiness.value?.pending && !count ? '待校验' : `待补全 ${count} 项`}` };
  }));
function selectNode(value: string) {
  try { writeParam(); } catch { message.error("当前参数不是合法 JSON，请修复后再切换节点"); return; }
  selected.value = value;
  paramJson.value = JSON.stringify(node.value?.param ?? {}, null, 2);
  void form.reload();
}
watch(() => props.workflowUuid, async (id) => {
  const current = ++generation;
  graph.value = null; selected.value = ""; failure.value = "";
  if (!id) return;
  busy.value = true;
  try {
    const [loaded] = await Promise.all([conn.api.domains.workflowBackend.graph(id), validation.refresh()]);
    if (current !== generation) return;
    graph.value = loaded;
    selectNode(readiness.value?.issues[0]?.nodeId ?? nodeOptions.value[0]?.value ?? "");
  } catch (error) { if (current === generation) failure.value = describeError(error); }
  finally { if (current === generation) busy.value = false; }
}, { immediate: true });

async function save() {
  if (!graph.value || busy.value) return;
  busy.value = true;
  try {
    writeParam();
    const saved = await conn.api.domains.workflowBackend.saveGraph(props.workflowUuid, {
      revision: graph.value.workflow.revision, nodes: graph.value.nodes, edges: graph.value.edges, site_binding_mode: "preserve",
    });
    emit("saved", saved); emit("close");
    message.success("参数已保存到原流程；运行前仍会重新校验绑定");
  } catch (error) { message.error(`保存失败，草稿已保留：${describeError(error)}`); }
  finally { busy.value = false; }
}
</script>

<template>
  <NModal :show="Boolean(workflowUuid)" preset="card" title="补全流程参数" style="width: min(660px, 94vw)" @update:show="!$event && emit('close')">
    <NAlert v-if="failure" type="error">{{ failure }}</NAlert>
    <template v-if="graph">
      <NAlert :type="readiness?.missing ? 'warning' : 'info'" :bordered="false" style="margin-bottom: 12px">
        {{ readiness?.pending ? '部分参数待校验。' : '' }}<template v-if="!readiness?.pending || readiness?.missing">待补全 {{ readiness?.missing ?? 0 }} 项。</template>Site 默认值需要在绑定窗口确认；不会直接执行设备动作。
      </NAlert>
      <NSelect :value="selected" :options="nodeOptions" :disabled="busy" filterable @update:value="selectNode" />
      <div style="margin-top: 16px"><ActionParamFields v-if="node" :key="selected" :form="form" /></div>
      <details v-if="node" style="margin-top: 16px">
        <summary>高级参数 JSON（填写 UUID 后仍需确认 Site）</summary>
        <NInput v-model:value="paramJson" type="textarea" :autosize="{ minRows: 5, maxRows: 15 }" />
      </details>
    </template>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="emit('close')">取消</NButton>
        <NButton type="primary" :loading="busy" :disabled="!graph" @click="save">保存参数</NButton>
      </NSpace>
    </template>
  </NModal>
</template>
