import { describe, expect, it } from "vitest";
import {
  CANVAS_NODE_SIZE,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  fitFrame,
  frameForLayout,
  frameSize,
  frameStyle,
  groupMembers,
  groupSubmitMeta,
} from "./canvas-groups";

describe("frameForLayout", () => {
  it("组框包住全部成员并在上方留标题栏；成员坐标换成组内相对坐标只需加 childOffset", () => {
    const layout = [
      { x: 0, y: 0 },
      { x: 312, y: 0 },
      { x: 624, y: 118 },
    ];
    const frame = frameForLayout({ x: 500, y: 300 }, layout);
    expect(frame.position).toEqual({ x: 500 - GROUP_PADDING, y: 300 - GROUP_HEADER_HEIGHT - GROUP_PADDING });
    expect(frame.width).toBe(624 + CANVAS_NODE_SIZE.width + GROUP_PADDING * 2);
    expect(frame.height).toBe(118 + CANVAS_NODE_SIZE.height + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2);
    // 组框位置 + 相对坐标 == 原来的绝对坐标
    const relative = { x: layout[2].x + frame.childOffset.x, y: layout[2].y + frame.childOffset.y };
    expect(frame.position.x + relative.x).toBe(500 + 624);
    expect(frame.position.y + relative.y).toBe(300 + 118);
  });

  it("fitFrame 只增不减：新成员超出时变大，都在框内时保持原尺寸", () => {
    const current = { width: 400, height: 300 };
    expect(fitFrame([{ position: { x: 24, y: 82 } }], current)).toEqual(current);
    expect(fitFrame([{ position: { x: 300, y: 400 }, width: 220, height: 72 }], current)).toEqual({
      width: 300 + 220 + GROUP_PADDING,
      height: 400 + 72 + GROUP_PADDING,
    });
    // style 往返
    expect(frameSize(frameStyle({ width: 400.4, height: 299.6 }))).toEqual({ width: 400, height: 300 });
    expect(frameSize(undefined)).toEqual({ width: 0, height: 0 });
  });
});

describe("groupSubmitMeta / groupMembers", () => {
  it("提交元数据带名字 / 描述 / 来源模板；成员按 parentNode 归组，空组也在", () => {
    expect(
      groupSubmitMeta({
        id: "g1",
        data: { groupName: "位点操作演示", groupDescription: "装载 → 转移 → 查看", templateId: "registry:u" },
      }),
    ).toEqual({ id: "g1", name: "位点操作演示", description: "装载 → 转移 → 查看", template_id: "registry:u" });
    expect(groupSubmitMeta({ id: "g2", data: { groupName: "手动分组" } })).toEqual({
      id: "g2",
      name: "手动分组",
      description: "",
    });
    const members = groupMembers([
      { id: "g1", type: "group" },
      { id: "n1", type: "action", parentNode: "g1" },
      { id: "n2", type: "action", parentNode: "g1" },
      { id: "n3", type: "action" },
      { id: "g2", type: "group" },
    ]);
    expect([...members.entries()]).toEqual([
      ["g1", ["n1", "n2"]],
      ["g2", []],
    ]);
  });
});
