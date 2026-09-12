/** Backend 调度权威投影：Workflow 定义、Task 与 Node Job。 */

import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import type {
  BackendWorkflow,
  BackendWorkflowNodeJob,
  BackendWorkflowRunMode,
  BackendWorkflowTask,
} from "@openlab/protocol";
import { loadWorkflowHttpSnapshot } from "../features/workflow-invalidation";
import { useConnectionStore } from "./connection";
import { describeError } from "../features/errors";

const ACTIVE_TASK_STATES = new Set<BackendWorkflowTask["status"]>([
  "pending",
  "running",
  "canceling",
]);

const ACTIVE_JOB_STATES = new Set<BackendWorkflowNodeJob["status"]>([
  "dispatched",
  "running",
  "intervention_required",
  "cancel_requested",
  "execution_unknown",
]);

export const useSchedulerStore = defineStore("scheduler", () => {
  const conn = useConnectionStore();
  const definitions = shallowRef<BackendWorkflow[]>([]);
  const tasks = shallowRef<BackendWorkflowTask[]>([]);
  const jobsByTask = shallowRef<Record<string, BackendWorkflowNodeJob[]>>({});
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref("");

  const workflows = computed(() =>
    [...definitions.value].sort((a, b) => b.update_time.localeCompare(a.update_time)),
  );
  const activeTasks = computed(() =>
    tasks.value.filter((task) => ACTIVE_TASK_STATES.has(task.status)),
  );
  const inflightCount = computed(() =>
    Object.values(jobsByTask.value)
      .flat()
      .filter((job) => ACTIVE_JOB_STATES.has(job.status)).length,
  );
  const initialLoading = computed(() => loading.value && !loaded.value && !error.value);

  async function refresh() {
    if (!conn.schedulerOnline) return;
    loading.value = true;
    try {
      const snapshot = await loadWorkflowHttpSnapshot(conn.api.domains.workflowBackend);
      definitions.value = snapshot.definitions;
      tasks.value = snapshot.tasks;
      jobsByTask.value = snapshot.jobsByTask;
      error.value = "";
      loaded.value = true;
    } catch (err) {
      error.value = describeError(err);
    } finally {
      loading.value = false;
    }
  }

  async function createTask(
    workflowUuid: string,
    runMode: BackendWorkflowRunMode = "normal",
    targetNodeUuid?: string,
  ) {
    const result = await conn.api.domains.workflowBackend.createTask({
      workflow_uuid: workflowUuid,
      run_mode: runMode,
      target_node_uuid: targetNodeUuid,
    });
    await refresh();
    return result;
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(intervalMs = 5000) {
    if (pollTimer !== null) return;
    void refresh();
    pollTimer = setInterval(() => void refresh(), intervalMs);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // frontend_event 只作失效通知；任何通知或重连后都重新走 HTTP 读取权威文档。
  watch(
    () => conn.workflowNoticeRevision,
    () => void refresh(),
  );

  return {
    definitions,
    workflows,
    tasks,
    activeTasks,
    jobsByTask,
    inflightCount,
    loading,
    initialLoading,
    error,
    refresh,
    createTask,
    startPolling,
    stopPolling,
  };
});
