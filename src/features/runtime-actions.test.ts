import { describe, expect, it } from "vitest";
import { isReportedHostNodeRoute } from "./runtime-action-routing";

describe("runtime.v1 host_node route", () => {
  it("优先按 route 元数据识别可重命名的 host_node", () => {
    expect(
      isReportedHostNodeRoute({
        device_uuid: "operator-host",
        config: { registry_name: "host_node", is_host_node: true },
      }),
    ).toBe(true);
  });

  it("兼容默认 host_node 与多 Host 命名约定", () => {
    expect(isReportedHostNodeRoute({ device_uuid: "host_node", config: {} })).toBe(true);
    expect(isReportedHostNodeRoute({ device_uuid: "host_node_2", config: {} })).toBe(true);
  });

  it("不把普通设备的同名 manual_confirm 动作误认成 Host", () => {
    expect(
      isReportedHostNodeRoute({
        device_uuid: "virtual_workbench",
        config: { registry_name: "virtual_workbench" },
      }),
    ).toBe(false);
    expect(
      isReportedHostNodeRoute({
        device_uuid: "host_node_fake",
        config: { registry_name: "virtual_workbench" },
      }),
    ).toBe(false);
  });
});
