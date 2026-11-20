import { describe, expect, it, vi } from "vitest";
import type { BackendWorkflowTask } from "@openlab/protocol";
import {
  bindWorkflowInvalidations,
  loadWorkflowHttpSnapshot,
  WORKFLOW_INVALIDATION_EVENT_TYPES,
  type WorkflowInvalidationSource,
  type WorkflowSnapshotApi,
} from "./workflow-invalidation";

class NoticeMock implements WorkflowInvalidationSource {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    // 这里不构造 data；UI listener 的入参也不会参与 HTTP URL 或正文选择。
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type } as Event);
    }
  }
}

describe("Workflow 轻通知与 HTTP 正文边界", () => {
  it("只订阅冻结事件类型，解绑后不再触发", () => {
    const source = new NoticeMock();
    const invalidate = vi.fn();
    const unbind = bindWorkflowInvalidations(source, invalidate);

    expect(WORKFLOW_INVALIDATION_EVENT_TYPES).toContain("stream.reset");
    for (const type of WORKFLOW_INVALIDATION_EVENT_TYPES) source.emit(type);
    source.emit("control.v1");
    expect(invalidate).toHaveBeenCalledTimes(WORKFLOW_INVALIDATION_EVENT_TYPES.length);

    unbind();
    source.emit(WORKFLOW_INVALIDATION_EVENT_TYPES[0]);
    expect(invalidate).toHaveBeenCalledTimes(WORKFLOW_INVALIDATION_EVENT_TYPES.length);
  });

  it("workflow.authoring.changed（定义 / 作者态变更）让定义列表重新经 HTTP 读取", async () => {
    const api: WorkflowSnapshotApi = {
      workflows: vi.fn(async () => ({ items: [] })),
      tasks: vi.fn(async () => ({ items: [] })),
      taskJobs: vi.fn(async () => []),
    };
    const source = new NoticeMock();
    let snapshot: Promise<unknown> | undefined;
    bindWorkflowInvalidations(source, () => {
      snapshot = loadWorkflowHttpSnapshot(api);
    });
    source.emit("workflow.authoring.changed");
    await snapshot;
    expect(api.workflows).toHaveBeenCalledWith({ page: 1, page_size: 100 });
  });

  it("一次 notice 只触发固定 typed HTTP GET 投影，不消费 payload 或任意 URL", async () => {
    const calls: string[] = [];
    const api: WorkflowSnapshotApi = {
      workflows: vi.fn(async () => {
        calls.push("GET /api/v1/workflows");
        return { items: [] };
      }),
      tasks: vi.fn(async () => {
        calls.push("GET /api/v1/workflow-tasks");
        return {
          items: [
            {
              uuid: "task-1",
              status: "running",
            } as BackendWorkflowTask,
          ],
        };
      }),
      taskJobs: vi.fn(async (taskUuid) => {
        calls.push(`GET /api/v1/workflow-tasks/${taskUuid}/jobs`);
        return [];
      }),
    };
    const source = new NoticeMock();
    let snapshotPromise: Promise<unknown> | undefined;
    bindWorkflowInvalidations(source, () => {
      snapshotPromise = loadWorkflowHttpSnapshot(api, Date.parse("2026-08-24T00:00:00Z"));
    });

    // V1：运行态变化统一是 workflow.runtime.changed（data.kind=task 等，listener 不读 data）
    source.emit("workflow.runtime.changed");
    await snapshotPromise;

    expect(calls).toEqual([
      "GET /api/v1/workflows",
      "GET /api/v1/workflow-tasks",
      "GET /api/v1/workflow-tasks/task-1/jobs",
    ]);
    expect(calls.some((call) => call.includes("http://") || call.includes("payload"))).toBe(false);
  });
});
