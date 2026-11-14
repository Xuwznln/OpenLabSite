/**
 * scheduler 域：V1 调度观测与运维（unilabos/server/api/runtime/scheduling_v1.py、lifecycle.py）。
 *
 * - `monitor/snapshot`、`timeline`、`scheduler/time-plan`：只读观测（调度权威回答，无本机调度时 5001）；
 * - `reschedule`：重新判定全部等待派发的作业（调试用）；
 * - `scheduler/drain*`：排空闸门（暂停新派发，等在途作业清空），`resume` 解除；
 * - `scheduler/inventory-recovery*`、`scheduler/physical-recovery*`：重启后需要人工核对的库存 / 物理结算。
 *
 * `GET /api/v1/monitor/events`（V1 四通道 SSE）不在浏览器目录里：OpenLabSite 的失效通知走 `/api/v1/events`。
 */
import type { HttpTransport, JsonObject } from "./common.js";
import type { OpenApiBody, OpenApiQuery } from "./openapi-types.js";

/** 泳道图数据：执行中作业 + 窗口内已完结作业 + 预估器统计 + 时间计划状态。 */
export interface SchedulerTimeline extends JsonObject {}
/** 监控快照：devices（busy / idle）、scheduler（workflow_states / inflight / reschedule_count）、各通道近期事件。 */
export interface SchedulerMonitorSnapshot extends JsonObject {}
/** 时间排程计划；没有时间计划引擎时 `{enabled: false, algorithm: "stable-ready-order"}`。 */
export interface SchedulerTimePlan extends JsonObject {}

export interface SchedulerDrainStatus {
  /** `running` / `draining` / `drained` 等。 */
  phase: string;
  active_device_job_count: number;
  active_device_job_ids: string[];
  requested: boolean;
  dispatch_paused: boolean;
  pause_reasons: string[];
}

export type SchedulerTimelineQuery = OpenApiQuery<"/api/v1/timeline", "get">;
export type SchedulerPhysicalSettleInput = OpenApiBody<"/api/v1/scheduler/physical-recovery/{job_uuid}/settle", "post">;
export type SchedulerPhysicalReleaseInput = OpenApiBody<"/api/v1/scheduler/physical-recovery/{job_uuid}/release", "post">;
export type SchedulerInventoryReconcileInput = OpenApiBody<"/api/v1/scheduler/inventory-recovery/reconcile", "post">;

export function createSchedulerApi(http: HttpTransport) {
  return {
    monitorSnapshot: () => http.request<SchedulerMonitorSnapshot>({ method: "GET", path: "/api/v1/monitor/snapshot" }),
    /** `window_s` 秒内已完结的作业（默认 3600）。 */
    timeline: (params: SchedulerTimelineQuery = {}) =>
      http.request<SchedulerTimeline>({ method: "GET", path: "/api/v1/timeline", params }),
    timePlan: () => http.request<SchedulerTimePlan>({ method: "GET", path: "/api/v1/scheduler/time-plan" }),
    /** 重新判定等待派发的作业；返回本次同步观察到的新派发 `{dispatched: [...]}`。 */
    reschedule: () => http.request<{ dispatched: string[] } & JsonObject>({ method: "POST", path: "/api/v1/reschedule" }),
    drainStatus: () => http.request<SchedulerDrainStatus>({ method: "GET", path: "/api/v1/scheduler/drain" }),
    drain: () => http.request<SchedulerDrainStatus>({ method: "POST", path: "/api/v1/scheduler/drain" }),
    resumeDrain: () => http.request<SchedulerDrainStatus>({ method: "POST", path: "/api/v1/scheduler/drain/resume" }),
    inventoryRecovery: () => http.request<JsonObject>({ method: "GET", path: "/api/v1/scheduler/inventory-recovery" }),
    reconcileInventory: (body: SchedulerInventoryReconcileInput) =>
      http.request<JsonObject>({ method: "POST", path: "/api/v1/scheduler/inventory-recovery/reconcile", body }),
    physicalRecovery: () => http.request<JsonObject>({ method: "GET", path: "/api/v1/scheduler/physical-recovery" }),
    settlePhysicalRecovery: (jobUuid: string, body: SchedulerPhysicalSettleInput) =>
      http.request<JsonObject>({
        method: "POST",
        path: `/api/v1/scheduler/physical-recovery/${encodeURIComponent(jobUuid)}/settle`,
        body,
      }),
    releasePhysicalRecovery: (jobUuid: string, body: SchedulerPhysicalReleaseInput) =>
      http.request<JsonObject>({
        method: "POST",
        path: `/api/v1/scheduler/physical-recovery/${encodeURIComponent(jobUuid)}/release`,
        body,
      }),
  };
}

export type SchedulerApi = ReturnType<typeof createSchedulerApi>;
