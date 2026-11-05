import { describe, expect, it } from "vitest";
import type { ReadinessResponse } from "@openlab/protocol";
import { readinessView } from "./readiness";

const body = (status: string, execution: string, reasons: string[] = []): ReadinessResponse => ({ status, scheduler: "local", execution, reasons });

describe("就绪探针在连接状态里的口径", () => {
  it("就绪：沿用角色文案（不加标记），说明执行面状态", () => {
    const view = readinessView(body("ready", "ready"), "available", true);
    expect(view).toMatchObject({ tone: "ready", badge: "", pillStatus: "online" });
    expect(readinessView(body("ready", "disabled"), "available", true).detail).toContain("纯调度权威");
  });

  it("未就绪：启动中 / 重启中 / 其他，带原因、胶囊变橙", () => {
    const starting = readinessView(body("not_ready", "starting", ["执行适配器尚未注册（设备初始化中）"]), "available", true);
    expect(starting).toMatchObject({ tone: "starting", badge: "启动中", pillStatus: "paused", reasons: ["执行适配器尚未注册（设备初始化中）"] });
    expect(readinessView(body("not_ready", "restarting"), "available", true)).toMatchObject({ tone: "restarting", badge: "重启中" });
    expect(readinessView(body("not_ready", "maintenance"), "available", true)).toMatchObject({ tone: "not_ready", badge: "未就绪" });
  });

  it("旧后端（404）/ 读取中 / 离线：不加标记、不报错", () => {
    expect(readinessView(null, "unsupported", true)).toMatchObject({ tone: "unknown", badge: "", pillStatus: "online" });
    expect(readinessView(null, "unsupported", true).detail).toContain("旧版本");
    expect(readinessView(null, "unknown", true)).toMatchObject({ badge: "", detail: "就绪状态读取中…" });
    expect(readinessView(body("ready", "ready"), "available", false)).toMatchObject({ tone: "unknown", pillStatus: "offline" });
  });
});
