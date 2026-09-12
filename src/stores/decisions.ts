/**
 * 人工决策面板态：动作异常（error-decisions）、状态联锁（status-incidents）
 * 与工作流干预（interventions）。REST 快照为权威，页面以轮询 + 可见性恢复收敛。
 *
 * 不可用语义：GET 503（本进程没有执行面，如 `--role backend`）或 404 → 整面板
 * 置灰而不弹错误；其余错误保留文案给页面提示。
 */

import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
  ApiError,
  type BackendIntervention,
  type ErrorDecision,
  type ErrorDecisionInput,
  type SchedulerHold,
  type StatusIncident,
  type StatusIncidentDecisionIn,
} from "@openlab/protocol";
import { useConnectionStore } from "./connection";
import { describeError } from "../features/errors";

export type PanelSupport = "unknown" | "available" | "unsupported";

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

  const pendingErrorCount = computed(() => errorDecisions.value.length);
  const activeIncidentCount = computed(() => incidents.value.length);
  const openInterventionCount = computed(() => interventions.value.length);
  /** 需要人介入的总数（侧栏角标）。 */
  const attentionCount = computed(
    () => pendingErrorCount.value + activeIncidentCount.value + openInterventionCount.value,
  );

  function classify(error: unknown, support: typeof errorSupport, lastError: typeof errorLastError) {
    if (error instanceof ApiError && error.isUnsupported) {
      support.value = "unsupported";
      lastError.value = "";
      return;
    }
    lastError.value = describeError(error);
  }

  async function refreshErrorDecisions() {
    if (!conn.online) return;
    try {
      const resp = await conn.api.domains.decisions.errorDecisions();
      errorDecisions.value = resp.items;
      errorSupport.value = "available";
      errorLastError.value = "";
    } catch (error) {
      errorDecisions.value = [];
      classify(error, errorSupport, errorLastError);
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

  async function refreshInterventions() {
    if (!conn.online || !conn.schedulerLocal) {
      interventions.value = [];
      return;
    }
    try {
      const api = conn.api.domains.workflowBackend;
      const page = await api.tasks({ page: 1, page_size: 200 });
      const waiting = page.items.filter((task) => task.control_status === "waiting_intervention");
      const rows = await Promise.all(waiting.map((task) => api.taskInterventions(task.uuid)));
      interventions.value = rows.flat().filter((item) => item.status === "open");
    } catch {
      interventions.value = [];
    }
  }

  async function refresh() {
    await Promise.all([refreshErrorDecisions(), refreshIncidents(), refreshInterventions()]);
  }

  /** 只透传 Host 下发的 options[].action；提交后以 GET 收敛。 */
  async function resolveIncident(incidentId: string, body: StatusIncidentDecisionIn) {
    try {
      return await conn.api.domains.decisions.resolveIncident(incidentId, body);
    } finally {
      void refreshIncidents();
    }
  }

  async function resolveErrorDecision(
    decision: Pick<ErrorDecision, "decision_id" | "job_id" | "device_id">,
    body: ErrorDecisionInput,
  ) {
    try {
      return await conn.api.domains.decisions.resolveErrorDecision(decision, body);
    } finally {
      void refreshErrorDecisions();
    }
  }

  function onVisible() {
    if (document.visibilityState === "visible") void refresh();
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(intervalMs = 5000) {
    if (pollTimer !== null) return;
    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    pollTimer = setInterval(() => void refresh(), intervalMs);
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
    pendingErrorCount,
    activeIncidentCount,
    openInterventionCount,
    attentionCount,
    refresh,
    refreshErrorDecisions,
    refreshIncidents,
    refreshInterventions,
    resolveIncident,
    resolveErrorDecision,
    startPolling,
    stopPolling,
  };
});
