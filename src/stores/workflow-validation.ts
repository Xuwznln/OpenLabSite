import { defineStore } from "pinia";
import { shallowRef, watch } from "vue";
import { actionSchemaDetailFromCapability, type BackendWorkflowGraph, type DeviceActionSchemaDetail } from "@openlab/protocol";
import { requireWorkflowReady, workflowReadiness } from "../features/workflow-readiness";
import { useConnectionStore } from "./connection";
import { useSiteBindingsStore } from "./site-bindings";

export const useWorkflowValidationStore = defineStore("workflow-validation", () => {
  const conn = useConnectionStore();
  const sites = useSiteBindingsStore();
  const schemas = shallowRef(new Map<string, DeviceActionSchemaDetail>());
  let pending: Promise<void> | null = null;
  let generation = 0;
  function refresh(): Promise<void> {
    if (pending) return pending;
    const current = generation;
    schemas.value = new Map();
    pending = (async () => {
      try {
        const [endpoints] = await Promise.all([conn.api.domains.runtimeV1.endpoints(), sites.refresh()]);
        if (current !== generation) return;
        schemas.value = new Map(endpoints.flatMap((endpoint) => endpoint.action_capabilities)
          .filter((capability) => capability.state === "active")
          .map((capability) => [`${capability.device_uuid}|${capability.action_name}`, actionSchemaDetailFromCapability(capability)]));
      } catch { /* 保持待校验，不把请求失败当成零缺项。 */ }
      finally { if (current === generation) pending = null; }
    })();
    return pending;
  }
  const inspect = (graph: BackendWorkflowGraph) => workflowReadiness(graph, schemas.value, sites.index);
  async function check(workflowUuid: string) {
    const [graph] = await Promise.all([conn.api.domains.workflowBackend.graph(workflowUuid), refresh()]);
    requireWorkflowReady(inspect(graph));
  }
  watch(() => [conn.baseUrl, conn.online], () => {
    generation++; pending = null; schemas.value = new Map();
    if (conn.online) void refresh();
  });
  return { schemas, refresh, inspect, check };
});
