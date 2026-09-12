/**
 * Workflow 图谱统计：节点数、边数以及按设备聚合的节点数。
 *
 * 设备引用按落库约定依次回退读取 `param.device_id`、`param.target_device_id`
 * 与 `meta_data.target_device_id`（ad-hoc 设备动作任务把目标设备写在
 * meta_data 里）。非字符串或空白值视为未引用设备。
 */

export interface GraphStatsNodeInput {
  param?: Record<string, unknown> | null;
  meta_data?: Record<string, unknown> | null;
}

export interface GraphDeviceStat {
  deviceId: string;
  nodeCount: number;
}

export interface WorkflowGraphStats {
  nodeCount: number;
  edgeCount: number;
  deviceCount: number;
  /** 按节点数降序，同数按 deviceId 升序。 */
  devices: GraphDeviceStat[];
}

function readDeviceId(source: Record<string, unknown> | null | undefined, key: string): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function extractNodeDeviceId(node: GraphStatsNodeInput): string | undefined {
  return (
    readDeviceId(node.param, "device_id") ??
    readDeviceId(node.param, "target_device_id") ??
    readDeviceId(node.meta_data, "target_device_id")
  );
}

export function computeWorkflowGraphStats(
  nodes: readonly GraphStatsNodeInput[],
  edges: readonly unknown[],
): WorkflowGraphStats {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const deviceId = extractNodeDeviceId(node);
    if (!deviceId) continue;
    counts.set(deviceId, (counts.get(deviceId) ?? 0) + 1);
  }
  const devices = [...counts.entries()]
    .map(([deviceId, nodeCount]) => ({ deviceId, nodeCount }))
    .sort((a, b) => b.nodeCount - a.nodeCount || a.deviceId.localeCompare(b.deviceId));
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    deviceCount: devices.length,
    devices,
  };
}
