/**
 * 人工决策面板态：动作异常（error-decisions）、状态联锁（status-incidents）
 * 与工作流干预（interventions）。REST 快照为权威。
 *
 * - 动作异常与干预：`station.error_handling.changed`（经 /events，见 features/decision-invalidation.ts）
 *   到达即重读；轮询退为兜底——通知流不在线时 5 s 一读，在线时只做低频校准。
 * - 状态联锁没有 SSE 事件，照旧 5 s 轮询；页面可见性恢复时全部重读。
 *
 * 不可用语义：GET 503（本进程没有执行面，如 `--role backend`）或 404 → 整面板
 * 置灰而不弹错误；其余错误保留文案给页面提示。
 */

import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import {
  type BackendIntervention,
  type BackendManualConfirmation,
  type BackendManualConfirmationDecisionInput,
  type BackendWorkflowTask,
  type ErrorDecision,
  type ErrorDecisionInput,
  type SchedulerHold,
  type StatusIncident,
  type StatusIncidentDecisionIn,
  isCapabilityUnavailable,
} from "@openlab/protocol";
import { useConnectionStore } from "./connection";
import { describeError } from "../features/errors";
import { describeTask } from "../features/task-jobs";
import { errorDecisionPollDue } from "../features/decision-invalidation";

export type PanelSupport = "unknown" | "available" | "unsupported";

/** 待处理的人工确认单 + 它所属任务的摘要（异常审批页与角标用）。 */
export interface PendingManualConfirmation {
  confirmation: BackendManualConfirmation;
  taskUuid: string;
  taskTitle: string;
  taskStatus: BackendWorkflowTask["status"];
}

/** 还可能挂着待确认单 / 干预的任务状态（终态任务不再查）。 */
const ACTIVE_TASK_STATUSES = new Set<string>(["pending", "running", "canceling"]);

export const useDecisionsStore = defineStore("decisions", () => {
  const conn = useConnectionStore();

  const errorDecisions = shallowRef<ErrorDecision[]>([]);
  const errorSupport = ref<PanelSupport>("unknown");
  const errorLastError = ref("");

  const incidents = shallowRef<StatusIncident[]>([]);
  const holds = shallowRef<SchedulerHold[]>([]);
  /** false = HostNode 启动中（GET 200 + host_ready=false + 空数组）。 */
  const hostReady = ref(true);
  const incidentSupport = ref<PanelSupport>("unknown");
  const incidentLastError = ref("");

  const interventions = shallowRef<BackendIntervention[]>([]);
  const manualConfirmations = shallowRef<PendingManualConfirmation[]>([]);

  /**
   * V1 里同一个待决动作失败既在 /error-decisions（执行面的决策台）也开出一条干预（edge_command_uuid =
   * decision_id）；两边投递同一个放行通道。页面只展示一次：已在动作异常里的干预不再单列。
   */
  const standaloneInterventions = computed(() => {
    const decisionIds = new Set(errorDecisions.value.map((item) => item.decision_id));
    return interventions.value.filter((item) => !item.edge_command_uuid || !decisionIds.has(item.edge_command_uuid));
  });
  const pendingErrorCount = computed(() => errorDecisions.value.length);
  const activeIncidentCount = computed(() => incidents.value.length);
  const openInterventionCount = computed(() => standaloneInterventions.value.length);
  const pendingConfirmationCount = computed(() => manualConfirmations.value.length);
  /** 需要人介入的总数（侧栏角标）。 */
  const attentionCount = computed(
    () =>
      pendingErrorCount.value +
      activeIncidentCount.value +
      openInterventionCount.value +
      pendingConfirmationCount.value,
  );

  function classify(error: unknown, support: typeof errorSupport, lastError: typeof errorLastError) {
    if (isCapabilityUnavailable(error)) {
      support.value = "unsupported";
      lastError.value = "";
      return;
    }
    lastError.value = describeError(error);
  }

  /** 上一次读 /error-decisions 的时刻（轮询兜底按它判定是否到期）。 */
  let errorDecisionsReadAt = 0;

  async function refreshErrorDecisions() {
    if (!conn.online) return;
    errorDecisionsReadAt = Date.now();
    try {
      const resp = await conn.api.domains.decisions.errorDecisions();
      errorDecisions.value = resp.decisions;
      errorSupport.value = "available";
      errorLastError.value = "";
    } catch (error) {
      errorDecisions.value = [];
      classify(error, errorSupport, errorLastError);
      // 读失败（如 Host 重启期间 5001）不算校准过：下一拍照常重试
      errorDecisionsReadAt = 0;
    }
  }

  async function refreshIncidents() {
    if (!conn.online) return;
    try {
      const resp = await conn.api.domains.decisions.incidents();
      hostReady.value = resp.host_ready;
      incidents.value = resp.incidents;
      holds.value = resp.holds;
      incidentSupport.value = "available";
      incidentLastError.value = "";
    } catch (error) {
      incidents.value = [];
      holds.value = [];
      classify(error, incidentSupport, incidentLastError);
    }
  }

  /**
   * Workflow Authority 侧需要人介入的两类事实：干预记录（V1 全局列表 `status=open`）与
   * 待处理的人工确认单（活跃任务上挂着的 pending 确认；没有全局列表端点，按活跃任务逐个取）。
   */
  async function refreshInterventions() {
    if (!conn.online || !conn.schedulerLocal) {
      interventions.value = [];
      manualConfirmations.value = [];
      return;
    }
    try {
      const api = conn.api.domains.workflowBackend;
      const page = await api.tasks({ page: 1, page_size: 100 });
      const active = page.items.filter((task) => ACTIVE_TASK_STATUSES.has(task.status));
      const [interventionRows, confirmationRows] = await Promise.all([
        api.interventions({ status: "open", limit: 200 }),
        Promise.all(
          active.map(async (task) => {
            const rows = await api.taskManualConfirmations(task.uuid).catch(() => [] as BackendManualConfirmation[]);
            return rows
              .filter((row) => row.status === "pending")
              .map(
                (confirmation): PendingManualConfirmation => ({
                  confirmation,
                  taskUuid: task.uuid,
                  taskTitle: describeTask(task),
                  taskStatus: task.status,
                }),
              );
          }),
        ),
      ]);
      interventions.value = interventionRows.filter((item) => item.status === "open");
      manualConfirmations.value = confirmationRows
        .flat()
        .sort((a, b) => (a.confirmation.deadline_at ?? "").localeCompare(b.confirmation.deadline_at ?? ""));
    } catch {
      interventions.value = [];
      manualConfirmations.value = [];
    }
  }

  async function refresh() {
    await Promise.all([refreshErrorDecisions(), refreshIncidents(), refreshInterventions()]);
  }

  /**
   * 提交人工确认决策（V1 按作业：确认单的 workflow_node_job_uuid 即 job_uuid）；后端校验指派名单
   * （不在名单 → 具体错误码），提交后重拉收敛。
   */
  async function decideManualConfirmation(
    confirmation: Pick<BackendManualConfirmation, "workflow_node_job_uuid">,
    body: BackendManualConfirmationDecisionInput,
  ) {
    try {
      return await conn.api.domains.workflowBackend.decideJobManualConfirmation(confirmation.workflow_node_job_uuid, body);
    } finally {
      void refreshInterventions();
    }
  }

  /** 按修订选择设备提供的干预方案（V1）；同一次点击的重试复用同一幂等键，提交后重拉收敛。 */
  async function decideIntervention(intervention: BackendIntervention, optionId: string, idempotencyKey: string) {
    try {
      return await conn.api.domains.workflowBackend.decideIntervention(
        intervention.uuid,
        { revision: intervention.revision, option_id: optionId },
        idempotencyKey,
      );
    } finally {
      void refreshInterventions();
    }
  }

  /** 只透传 Host 下发的 options[].action；提交后以 GET 收敛。 */
  async function resolveIncident(incidentId: string, body: StatusIncidentDecisionIn) {
    try {
      return await conn.api.domains.decisions.resolveIncident(incidentId, body);
    } finally {
      void refreshIncidents();
    }
  }

  async function resolveErrorDecision(decision: Pick<ErrorDecision, "decision_id">, body: ErrorDecisionInput) {
    try {
      // 同一 decision 同一提交内容复用幂等键：网络重试不会重复投递
      const idempotencyKey = `openlab-decision:${decision.decision_id}:${body.action ?? body.option?.action ?? "abort"}`;
      return await conn.api.domains.decisions.resolveErrorDecision(decision, body, { idempotencyKey });
    } finally {
      void refreshErrorDecisions();
    }
  }

  function onVisible() {
    if (document.visibilityState === "visible") void refresh();
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** 轮询一拍：联锁与干预照旧；动作异常只在通知流不在线或兜底间隔到期时读。 */
  function pollTick() {
    void refreshIncidents();
    void refreshInterventions();
    if (errorDecisionPollDue(conn.workflowNoticeState === "live", errorDecisionsReadAt, Date.now())) {
      void refreshErrorDecisions();
    }
  }

  // 工站错误开出 / 收口（station.error_handling.changed）或 /events 重连：动作异常与镜像它的干预一起重读，
  // 避免已处理的异常在干预列表里多挂一拍
  watch(
    () => conn.decisionNoticeRevision,
    () => {
      if (pollTimer === null) return;
      void refreshErrorDecisions();
      void refreshInterventions();
    },
  );

  function startPolling(intervalMs = 5000) {
    if (pollTimer !== null) return;
    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    pollTimer = setInterval(pollTick, intervalMs);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    document.removeEventListener("visibilitychange", onVisible);
  }

  return {
    errorDecisions,
    errorSupport,
    errorLastError,
    incidents,
    holds,
    hostReady,
    incidentSupport,
    incidentLastError,
    interventions,
    standaloneInterventions,
    manualConfirmations,
    pendingErrorCount,
    activeIncidentCount,
    openInterventionCount,
    pendingConfirmationCount,
    attentionCount,
    refresh,
    refreshErrorDecisions,
    refreshIncidents,
    refreshInterventions,
    resolveIncident,
    resolveErrorDecision,
    decideManualConfirmation,
    decideIntervention,
    startPolling,
    stopPolling,
  };
});
