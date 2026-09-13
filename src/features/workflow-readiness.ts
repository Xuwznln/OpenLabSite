/** 参数完整度汇总：定义卡片、详情与运行前使用同一口径。 */
import type { BackendWorkflowGraph, DeviceActionSchemaDetail } from "@openlab/protocol";
import { missingParamEntries, type MissingParamEntry } from "./param-completeness";
import type { SiteBindings, SiteIndex } from "./site-bindings";

export interface WorkflowReadiness {
  missing: number;
  pending: boolean;
  issues: { nodeId: string; label: string; entries: MissingParamEntry[] }[];
}

export function workflowReadiness(graph: BackendWorkflowGraph,
  schemas: ReadonlyMap<string, DeviceActionSchemaDetail>, sites: SiteIndex | null): WorkflowReadiness {
  const result: WorkflowReadiness = { missing: 0, pending: false, issues: [] };
  const nodes = new Map(graph.nodes.map((node) => [node.uuid, node]));
  const handles = new Map(graph.handle_templates.map((handle) => [handle.uuid, handle]));
  for (const node of graph.nodes) {
    let ancestor: typeof node | undefined = node;
    const seen = new Set<string>();
    let disabled = false;
    while (ancestor && !seen.has(ancestor.uuid)) {
      seen.add(ancestor.uuid);
      disabled ||= ancestor.disabled;
      ancestor = nodes.get(ancestor.parent_uuid ?? "");
    }
    if (disabled || !node.action_name) continue;
    const deviceId = String(node.meta_data?.target_device_id ?? "");
    const detail = schemas.get(`${deviceId}|${node.action_name}`);
    if (!detail) result.pending = true;
    const mappedPaths = graph.edges.filter((edge) => edge.target_node_uuid === node.uuid).map((edge) => {
      const handle = handles.get(edge.target_handle_uuid);
      return String(handle?.data_key || handle?.handle_key || "").split("@@@").at(-1) ?? "";
    }).filter((path) => path && path !== "ready");
    const entries = missingParamEntries({ detail: detail ?? null, deviceId, actionName: node.action_name,
      paramJson: JSON.stringify(node.param ?? {}), mappedPaths, sites,
      siteBindings: (node.meta_data?.site_bindings ?? {}) as unknown as SiteBindings,
      siteOwners: (node.meta_data?.site_binding_owners ?? {}) as Record<string, string> });
    if (entries.some((entry) => entry.reason === "site-unavailable")) result.pending = true;
    result.missing += entries.length;
    if (entries.length) result.issues.push({ nodeId: node.uuid, label: node.name, entries });
  }
  return result;
}

export function requireWorkflowReady(readiness: WorkflowReadiness): void {
  if (readiness.pending) throw new Error("参数待校验：动作定义或 Site 目录暂不可用，请刷新后重试");
  if (readiness.missing) throw new Error(`待补全 ${readiness.missing} 项，请进入画布确认参数。${readiness.issues[0]?.label ?? ""}：${readiness.issues[0]?.entries[0]?.label ?? ""}`);
}
