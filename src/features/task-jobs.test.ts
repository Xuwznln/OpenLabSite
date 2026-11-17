import { describe, expect, it } from "vitest";
import type { BackendWorkflowNodeJob, BackendWorkflowTask } from "@openlab/protocol";
import { describeNodeJob } from "./task-jobs";

const task = {
  uuid: "t",
  workflow_snapshot: {
    workflow: { name: "换盒" },
    nodes: [
      { uuid: "n-io", name: "人工装入", type: "material_io", param: { mode: "load", mount: "deck", site: "A1" } },
      { uuid: "n-if", name: "条件（第 9 行）", type: "condition", param: { version: 1, expression: { lit: true } } },
      { uuid: "n-act", name: "取", type: "device_action", action_name: "pick", meta_data: { target_device_id: "robot" } },
    ],
  },
} as unknown as BackendWorkflowTask;

const job = (nodeUuid: string) => ({ uuid: `j-${nodeUuid}`, workflow_node_uuid: nodeUuid, edge_uuid: "" }) as unknown as BackendWorkflowNodeJob;

describe("describeNodeJob：结构节点不在设备上", () => {
  it("人工物料带模式、条件只给类型名；设备为空", () => {
    expect(describeNodeJob(task, job("n-io"))).toEqual({ deviceId: "", actionName: "人工物料 · 装入", nodeName: "人工装入" });
    expect(describeNodeJob(task, job("n-if"))).toEqual({ deviceId: "", actionName: "条件", nodeName: "条件（第 9 行）" });
    expect(describeNodeJob(task, job("n-act"))).toEqual({ deviceId: "robot", actionName: "pick", nodeName: "取" });
  });
});
