/**
 * runtime.v1 在线设备动作库（编辑器画布设备条与插入节点面板共用）：
 * 拉取在线执行路由，按设备分组 active 动作能力。
 */
import { ref } from "vue";
import {
  actionDisplayName,
  actionGoalKeys,
  actionParameterTemplate,
  actionSchemaDetailFromCapability,
  type RuntimeActionCapability,
} from "@openlab/protocol";
import { useConnectionStore } from "../stores/connection";
import { isReportedHostNodeRoute } from "./runtime-action-routing";

export { isReportedHostNodeRoute } from "./runtime-action-routing";

/** 动作默认参数：goal_default 优先，缺省按 goal schema 推导空值模板。 */
export function runtimeActionParams(
  action: RuntimeActionCapability,
): Record<string, unknown> {
  return actionParameterTemplate(actionSchemaDetailFromCapability(action));
}

export interface ActionParamSummary {
  /** goal 参数个数（含物料/设备引用）。 */
  total: number;
  /** 其中是 placeholder（物料 / 设备 / 位点 / 人工确认等引用）的个数。 */
  refs: number;
  /** 展示名（注册表 display_name），没有时为空串。 */
  displayName: string;
  /** 「3 参数 · 2 引用」/「无参数」这类紧凑文案。 */
  label: string;
}

/** 动作条目上的参数概览：让人在插入前就知道要填多少东西。 */
export function actionParamSummary(action: RuntimeActionCapability): ActionParamSummary {
  const detail = actionSchemaDetailFromCapability(action);
  const keys = actionGoalKeys(detail);
  const refs = Object.keys(detail.placeholder_keys ?? {}).filter((key) => keys.includes(key)).length;
  const displayName = actionDisplayName(action.action_name, action.descriptor);
  const label = keys.length === 0 ? "无参数" : refs ? `${keys.length} 参数 · ${refs} 引用` : `${keys.length} 参数`;
  return {
    total: keys.length,
    refs,
    displayName: displayName === action.action_name ? "" : displayName,
    label,
  };
}

export function useRuntimeActions() {
  const conn = useConnectionStore();
  const loading = ref(true);
  const devicesAvailable = ref(false);
  const devices = ref<string[]>([]);
  const hostDevices = ref<string[]>([]);
  const actionsOf = ref<Record<string, RuntimeActionCapability[]>>({});

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const endpoints = await conn.api.domains.runtimeV1.endpoints();
      const online = endpoints.filter((endpoint) => endpoint.state === "online");
      const selectedRoutes = online
        .flatMap((endpoint) => endpoint.device_routes)
        .filter((route) => route.enabled && route.selected);
      const deviceIds = new Set(selectedRoutes.map((route) => route.device_uuid));
      devices.value = [...deviceIds];
      hostDevices.value = [...new Set(
        selectedRoutes
          .filter((route) => isReportedHostNodeRoute(route))
          .map((route) => route.device_uuid),
      )].sort();
      const grouped: Record<string, RuntimeActionCapability[]> = {};
      for (const capability of online.flatMap((endpoint) => endpoint.action_capabilities)) {
        if (!deviceIds.has(capability.device_uuid) || capability.state !== "active") continue;
        (grouped[capability.device_uuid] ??= []).push(capability);
      }
      actionsOf.value = grouped;
      devicesAvailable.value = devices.value.length > 0;
    } catch {
      devices.value = [];
      hostDevices.value = [];
      actionsOf.value = {};
      devicesAvailable.value = false;
    } finally {
      loading.value = false;
    }
  }

  return { loading, devicesAvailable, devices, hostDevices, actionsOf, load };
}
