import type { RuntimeDeviceRoute } from "@openlab/protocol";

/**
 * 判断 runtime.v1 route 是否是已上报的 host_node 服务设备。
 *
 * 新版 Edge 在已有 route.config 中发布 registry 元数据；旧快照没有该
 * 元数据时保留 host_node / host_node_* 命名约定，避免升级期间把默认 Host
 * 从编辑器特殊节点库中误删。不能只看 manual_confirm 动作，因为普通设备
 * 也可以声明一个同名的人工确认动作。
 */
export function isReportedHostNodeRoute(
  route: Pick<RuntimeDeviceRoute, "device_uuid" | "config">,
): boolean {
  const config = route.config ?? {};
  if (config.is_host_node === true) return true;
  // 有 registry 元数据时以它为准；不要让一个普通设备恰好采用
  // host_node_* id 就获得人工确认执行资格。
  if (typeof config.registry_name === "string" && config.registry_name.trim()) {
    return config.registry_name === "host_node";
  }
  return route.device_uuid === "host_node" || route.device_uuid.startsWith("host_node_");
}
