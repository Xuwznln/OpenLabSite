import { describe, expect, it } from "vitest";
import {
  defaultLoopNodeData,
  describeLoopNode,
  describeLoopProgress,
  loopNodeDataFromSpec,
  loopSpecFromNodeData,
  nearestLoopAncestor,
  parseLoopValue,
} from "./workflow-loops";

describe("loopSpecFromNodeData", () => {
  it("for：次数取整，无效次数报错", () => {
    expect(loopSpecFromNodeData({ mode: "for", count: 3.7 }, () => undefined)).toEqual({
      spec: { mode: "for", count: 3, interval_seconds: 0 },
    });
    expect(loopSpecFromNodeData({ mode: "for", count: 0 }, () => undefined).error).toContain("≥ 1");
  });

  it("while 设备状态：缺设备/字段报错，对比值按 JSON 解析", () => {
    const missing = loopSpecFromNodeData(
      { mode: "while", conditionSource: "device_state", deviceId: "heater", field: "", op: "<", value: "80" },
      () => undefined,
    );
    expect(missing.error).toContain("状态字段");
    const ok = loopSpecFromNodeData(
      { mode: "while", conditionSource: "device_state", deviceId: " heater ", field: "temp", op: "<", value: "80", maxIterations: 5, intervalSeconds: 2 },
      () => undefined,
    );
    expect(ok).toEqual({
      spec: {
        mode: "while",
        condition: { source: "device_state", op: "<", value: 80, device_id: "heater", field: "temp" },
        max_iterations: 5,
        interval_seconds: 2,
      },
    });
    // exists 不需要对比值
    expect(
      loopSpecFromNodeData(
        { mode: "while", conditionSource: "device_state", deviceId: "d", field: "f", op: "exists", value: "", intervalSeconds: 1 },
        () => undefined,
      ).error,
    ).toBeUndefined();
    expect(
      loopSpecFromNodeData(
        { mode: "while", conditionSource: "device_state", deviceId: "d", field: "f", op: ">", value: " ", intervalSeconds: 1 },
        () => undefined,
      ).error,
    ).toContain("对比值");
  });

  it("while 节点输出：编辑器节点 id 通过 resolveNodeRef 换成身份", () => {
    const built = loopSpecFromNodeData(
      { mode: "while", conditionSource: "node_output", conditionNodeId: "n2", dataKey: "ready", op: "==", value: "false" },
      (id) => (id === "n2" ? "uuid-2" : undefined),
    );
    expect(built.spec.condition).toEqual({ source: "node_output", op: "==", value: false, node_uuid: "uuid-2", data_key: "ready" });
    expect(
      loopSpecFromNodeData(
        { mode: "while", conditionSource: "node_output", conditionNodeId: "gone", op: "==", value: "1" },
        () => undefined,
      ).error,
    ).toContain("不存在");
  });

  it("空循环体的 while 需要轮询间隔", () => {
    const data = { mode: "while" as const, conditionSource: "device_state" as const, deviceId: "d", field: "f", op: "==" as const, value: "1" };
    expect(loopSpecFromNodeData({ ...data, intervalSeconds: 0 }, () => undefined, { hasBody: false }).error).toContain("轮询间隔");
    expect(loopSpecFromNodeData({ ...data, intervalSeconds: 1 }, () => undefined, { hasBody: false }).error).toBeUndefined();
  });
});

describe("loopNodeDataFromSpec", () => {
  it("后端 LoopSpec 往返成表单 data（克隆 / 模板插入）", () => {
    const data = loopNodeDataFromSpec(
      {
        mode: "while",
        condition: { source: "node_output", node_uuid: "u-9", data_key: "temperature", op: ">=", value: 80 },
        max_iterations: 12,
        interval_seconds: 0.5,
      },
      "升温",
      (ref) => (ref === "u-9" ? "n9" : undefined),
    );
    expect(data).toMatchObject({
      label: "升温",
      mode: "while",
      conditionSource: "node_output",
      conditionNodeId: "n9",
      dataKey: "temperature",
      op: ">=",
      value: "80",
      maxIterations: 12,
      intervalSeconds: 0.5,
    });
    expect(loopSpecFromNodeData(data, () => "u-9").spec).toEqual({
      mode: "while",
      condition: { source: "node_output", op: ">=", value: 80, node_uuid: "u-9", data_key: "temperature" },
      max_iterations: 12,
      interval_seconds: 0.5,
    });
    const forData = loopNodeDataFromSpec({ mode: "for", count: 4 }, "");
    expect(forData.count).toBe(4);
    expect(forData.label).toBe("重复 ×4");
    // 模板里的 node_key 也能解析
    expect(
      loopNodeDataFromSpec({ mode: "while", condition: { source: "node_output", node_key: "step-2", op: "==", value: true } }, "x", (ref) =>
        ref === "step-2" ? "n2" : undefined,
      ).conditionNodeId,
    ).toBe("n2");
  });
});

describe("文案与辅助", () => {
  it("摘要与进度", () => {
    expect(describeLoopNode(defaultLoopNodeData("for"))).toBe("重复 ×3");
    expect(describeLoopNode({ mode: "while", conditionSource: "device_state", deviceId: "heater", field: "t", op: "<", value: "80" })).toBe(
      "当 heater.t < 80 时重复",
    );
    expect(describeLoopProgress({ mode: "for", iteration: 1, count: 3 }, "running")).toBe("第 2/3 轮");
    expect(describeLoopProgress({ mode: "for", iteration: 2, count: 3 }, "succeeded")).toBe("3 轮完成");
    expect(describeLoopProgress({ mode: "while", iteration: 4, max_iterations: 100 }, "running")).toBe("第 5 轮（上限 100）");
    expect(describeLoopProgress(undefined, "running")).toBe("");
  });

  it("parseLoopValue 与最近循环祖先", () => {
    expect(parseLoopValue(" 80 ")).toBe(80);
    expect(parseLoopValue("true")).toBe(true);
    expect(parseLoopValue("ready")).toBe("ready");
    const nodes = new Map([
      ["g", { type: "group" }],
      ["L", { type: "loop", parentNode: "g" }],
      ["a", { type: "action", parentNode: "L" }],
      ["b", { type: "action", parentNode: "g" }],
    ]);
    expect(nearestLoopAncestor("a", nodes)).toBe("L");
    expect(nearestLoopAncestor("b", nodes)).toBeUndefined();
    expect(nearestLoopAncestor("L", nodes)).toBeUndefined();
  });
});
