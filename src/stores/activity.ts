/** Workflow Task/Node Job 权威 HTTP 投影的增量动态流。 */

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { BackendWorkflowNodeJob, BackendWorkflowTask } from "@openlab/protocol";
import { statusMeta } from "../theme";
import { useSchedulerStore } from "./scheduler";

export type ActivityKind = "run" | "ok" | "err" | "info";

export interface ActivityEvent {
  id: number;
  ts: number;
  kind: ActivityKind;
  text: string;
  /** 保留字段名以兼容现有展示组件；值现在是 canonical task UUID。 */
  workflowId?: string;
}

const MAX_EVENTS = 80;

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 16)}…` : id;
}

function taskKind(status: string): ActivityKind {
  if (status === "failed" || status === "timeout") return "err";
  if (status === "succeeded") return "ok";
  if (status === "running" || status === "pending") return "run";
  return "info";
}

export const useActivityStore = defineStore("activity", () => {
  const sched = useSchedulerStore();
  const events = ref<ActivityEvent[]>([]);

  let seq = 0;
  let baselined = false;
  let previousTasks = new Map<string, BackendWorkflowTask>();
  let previousJobs = new Map<string, BackendWorkflowNodeJob>();

  function push(kind: ActivityKind, text: string, taskUuid?: string) {
    events.value.unshift({ id: ++seq, ts: Date.now(), kind, text, workflowId: taskUuid });
    if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS;
  }

  watch(
    () => [sched.tasks, sched.jobsByTask] as const,
    ([tasks, jobsByTask]) => {
      const nextTasks = new Map(tasks.map((task) => [task.uuid, task]));
      const nextJobs = new Map(
        Object.values(jobsByTask)
          .flat()
          .map((job) => [job.uuid, job]),
      );
      if (!baselined) {
        baselined = true;
        previousTasks = nextTasks;
        previousJobs = nextJobs;
        return;
      }

      for (const task of tasks) {
        const previous = previousTasks.get(task.uuid);
        if (!previous) {
          push("run", `任务 ${shortId(task.uuid)} 已提交`, task.uuid);
        } else if (previous.status !== task.status) {
          push(
            taskKind(task.status),
            `任务 ${shortId(task.uuid)} → ${statusMeta(task.status).label}`,
            task.uuid,
          );
        }
      }
      for (const job of nextJobs.values()) {
        const previous = previousJobs.get(job.uuid);
        if (!previous || previous.status === job.status) continue;
        const name = `节点 ${shortId(job.workflow_node_uuid)} · attempt ${job.attempt_no}`;
        if (job.status === "running") push("info", `${name} 开始执行`, job.workflow_task_uuid);
        else if (job.status === "succeeded")
          push("ok", `${name} 完成`, job.workflow_task_uuid);
        else if (["failed", "timeout", "execution_unknown"].includes(job.status))
          push("err", `${name} → ${job.status}`, job.workflow_task_uuid);
      }

      previousTasks = nextTasks;
      previousJobs = nextJobs;
    },
  );

  return { events };
});
