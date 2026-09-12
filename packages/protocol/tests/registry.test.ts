/**
 * registry 域契约测试：条目级注册表版本与挂起升级。
 *
 * - 客户端方法 ↔ catalog 路径一一对应（机器校验，与后端
 *   unilabos/server/api/runtime/registry.py 保持一致）；
 * - 信封同 workflow 域：HTTP 200 + {code,data}，code!=0 抛 BackendBusinessError；
 * - pending-impacts 是画布/节点表"挂起·待升级"徽标的数据源。
 */
import { describe, expect, it } from "vitest";
import { createRegistryApi, type RegistryPendingImpact } from "../src/registry";
import { BackendBusinessError } from "../src/common";
import { catalogOps, collectCalls, createMockHttp, DUMMY_ID } from "./helpers";

function ok(data: unknown) {
  return { status: 200, data: { code: 0, data } };
}

describe("registry 协议客户端 ↔ catalog 契约", () => {
  it("覆盖 registry 域全部 HTTP 操作，路径名冻结", async () => {
    const mock = createMockHttp();
    const api = createRegistryApi(mock.http);
    const entry = {
      name: DUMMY_ID,
      template_uuid: "u",
      active_version: 1,
      pending_version: null,
      pending_conflicts: [],
      unusable_reason: "",
      removed_at_ms: null,
      updated_at_ms: 0,
      status: ["active"],
    };
    const called = await collectCalls(mock, {
      entries: () => {
        mock.nextResponse = ok({ entries: [] });
        return api.entries({ status: "pending" });
      },
      entry: () => {
        mock.nextResponse = ok(entry);
        return api.entry(DUMMY_ID);
      },
      pendingImpacts: () => {
        mock.nextResponse = ok({ impacts: [] });
        return api.pendingImpacts();
      },
      versions: () => {
        mock.nextResponse = ok({ versions: [] });
        return api.entryVersions(DUMMY_ID);
      },
      version: () => {
        mock.nextResponse = ok({});
        return api.entryVersion(DUMMY_ID, 1);
      },
      apply: () => {
        mock.nextResponse = ok(entry);
        return api.applyEntry(DUMMY_ID);
      },
      dismiss: () => {
        mock.nextResponse = ok(entry);
        return api.dismissEntry(DUMMY_ID);
      },
      restore: () => {
        mock.nextResponse = ok(entry);
        return api.restoreEntry(DUMMY_ID, 1);
      },
      reports: () => {
        mock.nextResponse = ok({ reports: [], total: 0, page: 1, page_size: 50 });
        return api.reports();
      },
    });
    // 数字段（版本号）归一成 `{}` 后应与 catalog 完全一致
    const normalized = new Set(
      [...called].map((item) => item.replace(/\/1$/, "/{}")),
    );
    expect(normalized).toEqual(catalogOps("registry"));
  });

  it("信封解包：code!=0 抛 BackendBusinessError，data 原样返回", async () => {
    const mock = createMockHttp();
    const api = createRegistryApi(mock.http);

    const impact: RegistryPendingImpact = {
      name: "pump",
      template_uuid: "u-pump",
      active_version: 1,
      pending_version: 2,
      conflicts: [{ action: "run", reason: "action-changed" }],
      affected_nodes: [
        {
          workflow_uuid: "wf-1",
          workflow_name: "合成A",
          node_uuid: "n-1",
          node_name: "进料",
          action: "run",
        },
      ],
    };
    mock.nextResponse = ok({ impacts: [impact] });
    const { impacts } = await api.pendingImpacts();
    expect(impacts).toEqual([impact]);

    mock.nextResponse = {
      status: 200,
      data: { code: 1000, error: "entry pump has no pending version" },
    };
    await expect(api.applyEntry("pump")).rejects.toBeInstanceOf(
      BackendBusinessError,
    );
  });
});
