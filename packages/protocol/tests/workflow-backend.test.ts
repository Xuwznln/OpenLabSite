import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BackendBusinessError } from "../src/common";
import {
  createWorkflowBackendApi,
  createWorkflowBackendClient,
  type BackendIntervention,
  type BackendManualConfirmation,
  type BackendManualConfirmationDecisionInput,
  type BackendNodeJobFeedback,
  type BackendNodeJobResult,
} from "../src/workflow-backend";
import { DUMMY_ID, catalogOps, createMockHttp, normalizeRecordedPath } from "./helpers";

describe("workflow 协议客户端（Backend 信封）", () => {
  it("覆盖 workflow 域全部 HTTP 操作，且不多不少", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    const invocations: Array<() => Promise<unknown>> = [
      () => api.createWorkflow({ name: "demo" }),
      () => api.createWorkflowFromTemplate({ template_uuid: DUMMY_ID, bindings: {} }),
      () => api.workflows(),
      () => api.workflow(DUMMY_ID),
      () => api.updateWorkflow(DUMMY_ID, { name: "demo" }),
      () => api.deleteWorkflow(DUMMY_ID),
      () => api.graph(DUMMY_ID),
      () => api.saveGraph(DUMMY_ID, { revision: 1, nodes: [], edges: [] }),
      () => api.createTask({ workflow_uuid: DUMMY_ID }),
      () => api.commandTask(DUMMY_ID, { type: "step", expected_revision: 0, idempotency_key: "step-1" }),
      () => api.tasks(),
      () => api.task(DUMMY_ID),
      () => api.taskJobs(DUMMY_ID),
      () => api.job(DUMMY_ID),
      () => api.taskNodeRuns(DUMMY_ID),
      () => api.nodeRun(DUMMY_ID),
      () => api.taskManualConfirmations(DUMMY_ID),
      () => api.manualConfirmation(DUMMY_ID),
      () => api.decideManualConfirmation(DUMMY_ID, { action: "approve" } satisfies BackendManualConfirmationDecisionInput),
      () => api.decideTaskManualConfirmation(DUMMY_ID, DUMMY_ID, { action: "approve" } satisfies BackendManualConfirmationDecisionInput),
      () => api.taskInterventions(DUMMY_ID),
      () => api.jobResults(DUMMY_ID),
      () => api.jobFeedbackHistory(DUMMY_ID),
      () => api.authoring(DUMMY_ID),
      () =>
        api.saveDraft(DUMMY_ID, {
          python_source: "print()",
          expected_draft_hash: null,
          expected_workflow_revision: 1,
        }),
      () =>
        api.applyAuthoring(DUMMY_ID, {
          expected_draft_hash: "h",
          expected_workflow_revision: 1,
          expected_candidate_hash: "c",
        }),
    ];
    for (const run of invocations) {
      mock.nextResponse = { status: 200, data: { code: 0, data: {} } };
      await run();
    }
    const called = new Set(
      mock.calls.map(({ method, url }) => `${method} ${normalizeRecordedPath(url)}`),
    );
    expect(called).toEqual(catalogOps("workflow"));
    // SSE 端点不走 axios，仅提供 URL 构造
    expect(api.eventsUrl()).toBe("http://edge.local/api/v1/events");
  });

  it("ad-hoc 设备动作与整图运行共用 POST /workflow-tasks", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    mock.nextResponse = { status: 200, data: { code: 0, data: { uuid: "t", execution_kind: "ad_hoc_device_action" } } };
    await api.createTask({
      execution_kind: "ad_hoc_device_action",
      device_id: "sample_rack",
      action_name: "load_sample",
      param: { sample_name: "s1", site: "A1" },
      execution_policy: { always_free: true },
    });
    expect(mock.calls[0]?.url).toBe("http://edge.local/api/v1/workflow-tasks");
    expect(mock.calls[0]?.data).toMatchObject({
      execution_kind: "ad_hoc_device_action",
      device_id: "sample_rack",
      action_name: "load_sample",
    });
  });

  it("单点控制保留版本和幂等键，业务冲突不会被当成功", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    const body = { type: "step" as const, expected_revision: 3, idempotency_key: "click-4" };
    mock.nextResponse = { status: 200, data: { code: 0, data: { control_revision: 4 } } };
    expect((await api.commandTask(DUMMY_ID, body)).control_revision).toBe(4);
    expect(mock.calls[0]?.data).toEqual(body);
    mock.nextResponse = { status: 200, data: { code: 3003, error: { msg: "stale control revision" } } };
    await expect(api.commandTask(DUMMY_ID, body)).rejects.toBeInstanceOf(BackendBusinessError);
  });

  it("人工确认决策走 canonical POST，并保留幂等键与显式确认人", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    mock.nextResponse = {
      status: 200,
      data: { code: 0, data: { uuid: DUMMY_ID, status: "approved" } },
    };
    await api.decideManualConfirmation(DUMMY_ID, {
      action: "approve",
      confirmed_by: "alice",
      decision_idempotency_key: "manual-1",
    });
    expect(mock.calls[0]).toMatchObject({
      method: "POST",
      url: `http://edge.local/api/v1/workflow-manual-confirmations/${DUMMY_ID}/decision`,
      data: {
        action: "approve",
        confirmed_by: "alice",
        decision_idempotency_key: "manual-1",
      },
    });
  });

  it("成功路径解出 data；HTTP 200 + code!=0 抛 BackendBusinessError；网络错误抛 ApiError", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);

    const task = {
      uuid: "75000000-0000-4000-8000-000000000001",
      status: "succeeded",
      execution_kind: "workflow",
    };
    mock.nextResponse = { status: 200, data: { code: 0, data: task } };
    await expect(api.task(task.uuid)).resolves.toEqual(task);

    mock.nextResponse = {
      status: 200,
      data: { code: 6100, error: { msg: "workflow task not found" } },
    };
    await expect(api.task("missing")).rejects.toMatchObject({
      name: "BackendBusinessError",
      code: 6100,
      message: "workflow task not found",
    });
    await api.task("missing").catch((error: unknown) => {
      expect(error).toBeInstanceOf(BackendBusinessError);
    });

    mock.nextNetworkError = new Error("ECONNREFUSED");
    await expect(api.workflows()).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
    });
  });

  it("同一客户端仅通过 base URL 切换微后端与正式后端", () => {
    const edge = createWorkflowBackendClient("http://127.0.0.1:8002/");
    const backend = createWorkflowBackendClient("https://backend.example.com/");
    expect(edge.workflows).toBeTypeOf("function");
    expect(backend.graph).toBeTypeOf("function");
  });

  it("canonical 状态词汇原样透传（终态 succeeded），客户端不做二次映射", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    mock.nextResponse = {
      status: 200,
      data: {
        code: 0,
        data: { items: [{ uuid: "t1", status: "succeeded" }], total: 1, page: 1, page_size: 20 },
      },
    };
    const page = await api.tasks();
    expect(page.items[0]?.status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// 运行时只读读取端点（backend 9dd16db1，spec §6）
// ---------------------------------------------------------------------------

describe("workflow-backend 运行时读取端点（spec §6 契约）", () => {
  const TASK = "11111111-1111-4111-8111-111111111111";
  const JOB = "22222222-2222-4222-8222-222222222222";
  const base = {
    create_time: "2026-08-13T12:00:00Z",
    update_time: "2026-08-13T12:00:05Z",
    meta_data: {},
  };

  /** §6.1 fixture：第一条已决策（可选键齐全），第二条 pending（可选键全部缺席）。 */
  const confirmations: BackendManualConfirmation[] = [
    {
      ...base,
      uuid: "c1",
      description: "现场核对试剂瓶",
      workflow_task_uuid: TASK,
      workflow_node_job_uuid: JOB,
      status: "approved",
      assignee_user_ids: ["user-1", "user-2"],
      param: { prompt: "确认试剂已就位" },
      opened_at: "2026-08-13T12:00:00Z",
      confirmed_by: "user-1",
      comment: "已核对",
      decision_idempotency_key: "idem-1",
      deadline_at: "2026-08-13T12:30:00Z",
      decided_at: "2026-08-13T12:01:00Z",
    },
    {
      ...base,
      uuid: "c2",
      workflow_task_uuid: TASK,
      workflow_node_job_uuid: "job-2",
      status: "pending",
      assignee_user_ids: [],
      param: {},
      opened_at: "2026-08-13T12:02:00Z",
      // confirmed_by/comment/decision_idempotency_key/deadline_at/decided_at
      // 均为 DB NULL → 键缺席（不是 null）
    },
  ];

  /** §6.2 fixture：selected（决策键齐全）+ open（未决策，selected_option={}）。 */
  const interventions: BackendIntervention[] = [
    {
      ...base,
      uuid: "i1",
      workflow_task_uuid: TASK,
      workflow_node_job_uuid: JOB,
      edge_agent_uuid: "edge-1",
      revision: 1,
      status: "selected",
      options: [{ id: "retry", label: "重试" }, { id: "skip", label: "跳过" }],
      resume_control_status: "active",
      selected_option: { id: "retry", label: "重试" },
      opened_at: "2026-08-13T12:00:00Z",
      selected_option_id: "retry",
      decision_idempotency_key: "idem-2",
      edge_command_uuid: "cmd-1",
      decided_at: "2026-08-13T12:03:00Z",
    },
    {
      ...base,
      uuid: "i2",
      workflow_task_uuid: TASK,
      workflow_node_job_uuid: JOB,
      edge_agent_uuid: "edge-1",
      revision: 2,
      status: "open",
      options: [{ id: "retry", label: "重试" }],
      resume_control_status: "paused",
      selected_option: {}, // 未决策时是空对象 {}，不是键缺席
      opened_at: "2026-08-13T12:04:00Z",
    },
  ];

  /** §6.3 fixture：单条 result（唯一索引保证每 job 至多一条）。 */
  const results: BackendNodeJobResult[] = [
    {
      ...base,
      uuid: "r1",
      workflow_node_job_uuid: JOB,
      edge_command_uuid: "cmd-1",
      idempotency_key: "idem-3",
      outcome: "succeeded",
      return_info: { yield: 0.92 },
      error_info: [],
      committed_at: "2026-08-13T12:05:00Z",
      // consumed_at 缺席 = 尚未被调度器消费
    },
  ];

  /** §6.4 fixture：sequence 自然序，第二条 published_at 缺席。 */
  const feedback: BackendNodeJobFeedback[] = [
    {
      ...base,
      uuid: "f1",
      workflow_node_job_uuid: JOB,
      sequence: 1,
      feedback_type: "progress",
      data: { percent: 50 },
      observed_at: "2026-08-13T12:04:30Z",
      received_at: "2026-08-13T12:04:31Z",
      idempotency_key: "idem-4",
      published_at: "2026-08-13T12:04:32Z",
    },
    {
      ...base,
      uuid: "f2",
      workflow_node_job_uuid: JOB,
      sequence: 2,
      feedback_type: "progress",
      data: { percent: 100 },
      observed_at: "2026-08-13T12:05:00Z",
      received_at: "2026-08-13T12:05:01Z",
      idempotency_key: "idem-5",
    },
  ];

  const endpoints = [
    {
      name: "manual-confirmations",
      path: `/api/v1/workflow-tasks/${TASK}/manual-confirmations`,
      rows: confirmations,
      invoke: (api: ReturnType<typeof createWorkflowBackendApi>, params?: { limit?: number; offset?: number }) =>
        api.taskManualConfirmations(TASK, params),
    },
    {
      name: "interventions",
      path: `/api/v1/workflow-tasks/${TASK}/interventions`,
      rows: interventions,
      invoke: (api: ReturnType<typeof createWorkflowBackendApi>, params?: { limit?: number; offset?: number }) =>
        api.taskInterventions(TASK, params),
    },
    {
      name: "results",
      path: `/api/v1/workflow-node-jobs/${JOB}/results`,
      rows: results,
      invoke: (api: ReturnType<typeof createWorkflowBackendApi>, params?: { limit?: number; offset?: number }) =>
        api.jobResults(JOB, params),
    },
    {
      name: "feedback-history",
      path: `/api/v1/workflow-node-jobs/${JOB}/feedback-history`,
      rows: feedback,
      invoke: (api: ReturnType<typeof createWorkflowBackendApi>, params?: { limit?: number; offset?: number }) =>
        api.jobFeedbackHistory(JOB, params),
    },
  ] as const;

  it("四端点：正常列表解包 + 命中冻结路径", async () => {
    for (const ep of endpoints) {
      const mock = createMockHttp();
      const api = createWorkflowBackendApi(mock.http);
      mock.nextResponse = { status: 200, data: { code: 0, data: ep.rows } };
      await expect(ep.invoke(api)).resolves.toEqual(ep.rows);
      expect(mock.calls[0]?.method).toBe("GET");
      expect(mock.calls[0]?.url).toBe(`http://edge.local${ep.path}`);
    }
  });

  it("code=1000（uuid/分页参数非法）与 code=3002（父资源不存在或软删）抛 BackendBusinessError", async () => {
    for (const ep of endpoints) {
      const mock = createMockHttp();
      const api = createWorkflowBackendApi(mock.http);
      mock.nextResponse = {
        status: 200,
        data: { code: 1000, error: { msg: "invalid uuid" } },
      };
      await expect(ep.invoke(api)).rejects.toMatchObject({
        name: "BackendBusinessError",
        code: 1000,
      });
      mock.nextResponse = {
        status: 200,
        data: { code: 3002, error: { msg: "parent not found" } },
      };
      await expect(ep.invoke(api)).rejects.toMatchObject({
        name: "BackendBusinessError",
        code: 3002,
        message: "parent not found",
      });
    }
  });

  it("父资源存在但无记录 → code=0 + 空列表（不是 404）", async () => {
    for (const ep of endpoints) {
      const mock = createMockHttp();
      const api = createWorkflowBackendApi(mock.http);
      mock.nextResponse = { status: 200, data: { code: 0, data: [] } };
      await expect(ep.invoke(api)).resolves.toEqual([]);
    }
  });

  it("可选字段 = DB NULL 时键缺席（不是 null）；mock fixture 覆盖缺席形态", () => {
    // §6.1：pending 行的决策类可选键全部缺席
    const pending = confirmations[1]!;
    for (const key of ["confirmed_by", "comment", "decision_idempotency_key", "deadline_at", "decided_at"]) {
      expect(key in pending, `manual-confirmation.${key} 应缺席`).toBe(false);
    }
    // §6.2：open 行决策键缺席，但 selected_option 必在且为空对象 {}
    const open = interventions[1]!;
    for (const key of ["selected_option_id", "decision_idempotency_key", "edge_command_uuid", "decided_at"]) {
      expect(key in open, `intervention.${key} 应缺席`).toBe(false);
    }
    expect(open.selected_option).toEqual({});
    // §6.3：未消费 result 的 consumed_at 缺席
    expect("consumed_at" in results[0]!).toBe(false);
    // §6.4：未发布反馈的 published_at 缺席
    expect("published_at" in feedback[1]!).toBe(false);
    // 任何 fixture 都不得出现 null 形态的可选键
    for (const row of [...confirmations, ...interventions, ...results, ...feedback]) {
      for (const [key, value] of Object.entries(row)) {
        expect(value, `${key} 不得为 null（可选=键缺席）`).not.toBeNull();
      }
    }
  });

  it("limit/offset 原样透传；不传 = 全量（无分页参数）", async () => {
    for (const ep of endpoints) {
      const mock = createMockHttp();
      const api = createWorkflowBackendApi(mock.http);
      mock.nextResponse = { status: 200, data: { code: 0, data: [] } };
      await ep.invoke(api, { limit: 20, offset: 40 });
      expect(mock.calls[0]?.params).toEqual({ limit: 20, offset: 40 });
      mock.nextResponse = { status: 200, data: { code: 0, data: [] } };
      await ep.invoke(api);
      const sent = mock.calls[1]?.params ?? {};
      expect("limit" in sent, "不传 limit 时不得发送该参数").toBe(false);
      expect("offset" in sent, "不传 offset 时不得发送该参数").toBe(false);
    }
  });

  it("job_access_token_hash 有意不输出：类型与 fixture 永不出现该字段（锁定）", () => {
    // fixture 层：任何 result 行不得携带该键
    for (const row of results) {
      expect("job_access_token_hash" in row).toBe(false);
    }
    // 类型层：workflow-backend.ts 源码中该名字只允许出现在注释（“不得加回”说明），
    // 不允许作为字段声明出现
    const source = readFileSync(
      fileURLToPath(new URL("../src/workflow-backend.ts", import.meta.url)),
      "utf-8",
    );
    expect(/job_access_token_hash\??\s*:/.test(source)).toBe(false);
  });

  it("多 attempt 渲染路径（§6.3 红线）：先 taskJobs 再逐 job 取 results，每 job 按至多一条处理", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    // 同 task+node 的两个 job 行（attempt_no 1/2），而不是同一 job 的两条 result
    const jobs = [
      { uuid: "job-a1", workflow_task_uuid: TASK, workflow_node_uuid: "node-1", workflow_node_run_uuid: "run-1", attempt_no: 1, trigger: "initial" },
      { uuid: "job-a2", workflow_task_uuid: TASK, workflow_node_uuid: "node-1", workflow_node_run_uuid: "run-1", attempt_no: 2, trigger: "retry_decision" },
    ];
    mock.nextResponse = { status: 200, data: { code: 0, data: jobs } };
    const jobRows = await api.taskJobs(TASK);
    expect(jobRows.map((j) => j.attempt_no)).toEqual([1, 2]);
    for (const job of jobRows) {
      mock.nextResponse = { status: 200, data: { code: 0, data: results } };
      const rows = await api.jobResults(job.uuid);
      // 响应保持列表形状，但渲染按至多一条处理
      expect(rows.length).toBeLessThanOrEqual(1);
    }
    expect(mock.calls.map((c) => normalizeRecordedPath(c.url))).toEqual([
      `/api/v1/workflow-tasks/${TASK}/jobs`,
      "/api/v1/workflow-node-jobs/job-a1/results",
      "/api/v1/workflow-node-jobs/job-a2/results",
    ]);
  });
});
