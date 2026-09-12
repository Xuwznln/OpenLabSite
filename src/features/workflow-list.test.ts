import { describe, expect, it } from "vitest";
import type { BackendWorkflowNodeJob, BackendWorkflowTask } from "@openlab/protocol";
import {
  displayTags,
  effectiveTaskStatus,
  formatDuration,
  formatWhen,
  sortTasksLatestFirst,
  summarizeRuns,
  taskDurationMs,
  taskProgress,
} from "./workflow-list";

function task(overrides: Partial<BackendWorkflowTask> & { uuid: string }): BackendWorkflowTask {
  return {
    create_time: "2026-09-04T10:00:00Z",
    update_time: "2026-09-04T10:00:00Z",
    meta_data: {},
    workflow_uuid: "wf-1",
    execution_kind: "workflow",
    status: "succeeded",
    workflow_snapshot: {},
    execution_plan: {},
    run_mode: "normal",
    control_status: "active",
    cleanup_status: "none",
    trace_context: {},
    error_info: [],
    ...overrides,
  };
}

let jobSeq = 0;

function job(
  status: BackendWorkflowNodeJob["status"],
  overrides: Partial<BackendWorkflowNodeJob> = {},
): BackendWorkflowNodeJob {
  jobSeq += 1;
  return {
    status,
    workflow_node_uuid: `node-${jobSeq}`,
    attempt_no: 1,
    // 没有快照时按创建时间排序：递增秒即声明序
    create_time: `2026-09-04T10:00:${String(jobSeq).padStart(2, "0")}Z`,
    return_info: {},
    ...overrides,
  } as BackendWorkflowNodeJob;
}

describe("workflow-list", () => {
  it("按定义汇总运行：总数、进行中数、最近一次", () => {
    const tasks = [
      task({ uuid: "t1", started_at: "2026-09-04T10:00:00Z", status: "succeeded" }),
      task({ uuid: "t2", started_at: "2026-09-04T12:00:00Z", status: "running" }),
      task({ uuid: "t3", workflow_uuid: "wf-2", started_at: "2026-09-04T09:00:00Z", status: "failed" }),
      task({ uuid: "adhoc", workflow_uuid: null, execution_kind: "ad_hoc_device_action" }),
    ];
    const summary = summarizeRuns(tasks);
    expect(summary.get("wf-1")).toMatchObject({ total: 2, active: 1 });
    expect(summary.get("wf-1")?.latest.uuid).toBe("t2");
    expect(summary.get("wf-2")).toMatchObject({ total: 1, active: 0 });
    expect(summary.size).toBe(2);
  });

  it("运行记录按开始时间倒序，未开始的按创建时间", () => {
    const sorted = sortTasksLatestFirst([
      task({ uuid: "old", started_at: "2026-09-04T08:00:00Z" }),
      task({ uuid: "pending", create_time: "2026-09-04T13:00:00Z", status: "pending" }),
      task({ uuid: "new", started_at: "2026-09-04T12:00:00Z" }),
    ]);
    expect(sorted.map((t) => t.uuid)).toEqual(["pending", "new", "old"]);
  });

  it("进度：运行中按已结束节点数；没有作业数据时为 null", () => {
    const running = task({ uuid: "r", status: "running" });
    expect(taskProgress(running, undefined)).toBeNull();
    expect(taskProgress(running, [])).toBeNull();
    expect(taskProgress(running, [job("succeeded"), job("running"), job("skipped"), job("pending")])).toEqual({
      done: 2,
      total: 4,
      ratio: 0.5,
      stoppedAt: null,
      tone: "running",
    });
    const finished = task({ uuid: "s", status: "succeeded" });
    expect(taskProgress(finished, [job("succeeded"), job("skipped")])).toMatchObject({ done: 2, total: 2, ratio: 1, tone: "done" });
  });

  it("进度：失败 / 取消显示死在第几个节点，而不是 fail-fast 收敛后的 N/N", () => {
    // 第 1 个节点失败，其余 7 个被 fail-fast 收敛为 canceled：显示 1/8、红色
    const failedJobs = [job("failed"), ...Array.from({ length: 7 }, () => job("canceled"))];
    expect(taskProgress(task({ uuid: "f", status: "failed" }), failedJobs)).toEqual({
      done: 0,
      total: 8,
      ratio: 1 / 8,
      stoppedAt: 1,
      tone: "failed",
    });
    // 前两个成功、第 3 个失败：3/5
    const midway = [job("succeeded"), job("succeeded"), job("timeout"), job("canceled"), job("canceled")];
    expect(taskProgress(task({ uuid: "t", status: "timeout" }), midway)).toMatchObject({ done: 2, stoppedAt: 3, total: 5, tone: "failed" });
    // 取消：停在第一个没完成的节点，橙色
    const canceled = [job("succeeded"), job("canceled"), job("canceled")];
    expect(taskProgress(task({ uuid: "c", status: "canceled" }), canceled)).toMatchObject({ done: 1, stoppedAt: 2, total: 3, tone: "canceled" });
    // 同一节点重试两次：按最后一次 attempt 算，节点数不重复计
    const retried = [
      job("failed", { workflow_node_uuid: "n1", attempt_no: 1 }),
      job("succeeded", { workflow_node_uuid: "n1", attempt_no: 2 }),
      job("succeeded", { workflow_node_uuid: "n2" }),
    ];
    expect(taskProgress(task({ uuid: "rt", status: "succeeded" }), retried)).toMatchObject({ done: 2, total: 2, tone: "done" });
  });

  it("因取消而失败的旧记录识别为已取消", () => {
    const legacy = task({ uuid: "l", status: "failed" });
    const jobs = [
      job("succeeded"),
      job("failed", { return_info: { suc: false, suc_type: "cancellation" } }),
      job("canceled"),
    ];
    expect(effectiveTaskStatus(legacy, jobs)).toBe("canceled");
    expect(taskProgress(legacy, jobs)).toMatchObject({ stoppedAt: 2, total: 3, tone: "canceled" });
    // 真失败不受影响；没有 jobs 时沿用任务状态
    expect(effectiveTaskStatus(legacy, [job("failed", { return_info: { suc: false, suc_type: "normal" } })])).toBe("failed");
    expect(effectiveTaskStatus(legacy, undefined)).toBe("failed");
    expect(effectiveTaskStatus(task({ uuid: "ok", status: "succeeded" }), jobs)).toBe("succeeded");
  });

  it("耗时：已结束用结束时间，进行中用当前时间，未开始为 null", () => {
    const now = Date.parse("2026-09-04T10:05:00Z");
    expect(taskDurationMs(task({ uuid: "a", started_at: "2026-09-04T10:00:00Z", finished_at: "2026-09-04T10:01:30Z" }), now)).toBe(90_000);
    expect(taskDurationMs(task({ uuid: "b", started_at: "2026-09-04T10:00:00Z", status: "running" }), now)).toBe(300_000);
    expect(taskDurationMs(task({ uuid: "c", status: "pending" }), now)).toBeNull();
    // 已结束但没有 finished_at（异常数据）不按当前时间硬算
    expect(taskDurationMs(task({ uuid: "d", started_at: "2026-09-04T10:00:00Z", status: "failed" }), now)).toBeNull();
  });

  it("时长文案", () => {
    expect(formatDuration(4_000)).toBe("4 秒");
    expect(formatDuration(65_000)).toBe("1 分 5 秒");
    expect(formatDuration(120_000)).toBe("2 分");
    expect(formatDuration(3_600_000 + 12 * 60_000)).toBe("1 小时 12 分");
    expect(formatDuration(26 * 3_600_000)).toBe("1 天 2 小时");
  });

  it("时间文案：今天 / 昨天 / 同年 / 跨年", () => {
    const now = new Date(2026, 8, 5, 9, 30).getTime();
    expect(formatWhen(new Date(2026, 8, 5, 1, 24).toISOString(), now)).toBe("今天 01:24");
    expect(formatWhen(new Date(2026, 8, 4, 18, 3).toISOString(), now)).toBe("昨天 18:03");
    expect(formatWhen(new Date(2026, 7, 30, 12, 0).toISOString(), now)).toBe("8/30 12:00");
    expect(formatWhen(new Date(2025, 11, 1, 8, 5).toISOString(), now)).toBe("2025/12/1 08:05");
    expect(formatWhen(undefined, now)).toBe("—");
  });

  it("隐藏编排器自动标签", () => {
    expect(displayTags(["openlab-editor", "synthesis", 3])).toEqual(["synthesis", "3"]);
  });
});
