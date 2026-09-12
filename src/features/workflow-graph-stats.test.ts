import { describe, expect, it } from "vitest";
import {
  computeWorkflowGraphStats,
  extractNodeDeviceId,
  type GraphStatsNodeInput,
} from "./workflow-graph-stats";

function node(param: Record<string, unknown> = {}, metaData: Record<string, unknown> = {}): GraphStatsNodeInput {
  return { param, meta_data: metaData };
}

describe("computeWorkflowGraphStats", () => {
  it("空图返回全零统计", () => {
    const stats = computeWorkflowGraphStats([], []);
    expect(stats).toEqual({ nodeCount: 0, edgeCount: 0, deviceCount: 0, devices: [] });
  });

  it("多设备按节点数降序、同数按 id 升序聚合", () => {
    const nodes = [
      node({ device_id: "pump-1" }),
      node({ device_id: "pump-1" }),
      node({ device_id: "heater-1" }),
      node({ device_id: "arm-1" }),
    ];
    const stats = computeWorkflowGraphStats(nodes, [{}, {}, {}]);
    expect(stats.nodeCount).toBe(4);
    expect(stats.edgeCount).toBe(3);
    expect(stats.deviceCount).toBe(3);
    expect(stats.devices).toEqual([
      { deviceId: "pump-1", nodeCount: 2 },
      { deviceId: "arm-1", nodeCount: 1 },
      { deviceId: "heater-1", nodeCount: 1 },
    ]);
  });

  it("缺 device_id 的节点计入节点数但不计入设备聚合", () => {
    const nodes = [
      node({ device_id: "pump-1" }),
      node(), // 无任何设备引用
      node({ device_id: "" }), // 空串视为缺失
      node({ device_id: "   " }), // 空白视为缺失
    ];
    const stats = computeWorkflowGraphStats(nodes, []);
    expect(stats.nodeCount).toBe(4);
    expect(stats.deviceCount).toBe(1);
    expect(stats.devices).toEqual([{ deviceId: "pump-1", nodeCount: 1 }]);
  });

  it("按既有落库约定回退提取 param/meta_data 中的设备引用", () => {
    expect(extractNodeDeviceId(node({ device_id: "d-1", target_device_id: "d-2" }))).toBe("d-1");
    expect(extractNodeDeviceId(node({ target_device_id: "d-2" }))).toBe("d-2");
    expect(extractNodeDeviceId(node({}, { target_device_id: "d-3" }))).toBe("d-3");
    expect(extractNodeDeviceId(node({ device_id: 42 as unknown }))).toBeUndefined();
    expect(extractNodeDeviceId({ param: null, meta_data: null })).toBeUndefined();
  });
});
