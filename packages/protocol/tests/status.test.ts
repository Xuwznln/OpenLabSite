/**
 * status-incidents 契约测试（CONTRACT-status-incidents.md 冻结版）。
 *
 * §10 前端不变量逐条断言：
 *  10.1 incident_id / hold_token 分别是面板项与 hold 项唯一键（upsert 去重）
 *  10.2 只提交 Host 返回的 options[].action；recovery_action 只读展示
 *  10.3 POST delivered ≠ 恢复成功；recovering 期间不移除面板项
 *  10.4 default_on_timeout=hold：前端不自行执行任何默认动作
 *  10.5 hold 消失以 resolved/cleared 事件（或 snapshot）为准
 *  10.6 SSE seq 跳号 → 重拉 snapshot
 *  10.7 同一 policy×device 恢复后再告警是新 incident_id，不复用旧面板项
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/common";
import {
  applyStatusMonitorEvent,
  createMockStatusIncidentState,
  createDecisionsApi,
  isConsecutiveStatusSeq,
  type StatusIncident,
  type StatusIncidentPanelState,
  type StatusMonitorEvent,
} from "../src/status";
import { catalogOps, collectCalls, createMockHttp, DUMMY_ID } from "./helpers";

const createStatusApi = createDecisionsApi;

function requiredEvent(
  incident: StatusIncident,
  seq: number,
): StatusMonitorEvent {
  return {
    seq,
    ts: incident.updated_at,
    channel: "status",
    type: "status_incident_required",
    data: incident as unknown as Record<string, unknown>,
    trace_id: "",
    span_id: "",
  };
}

describe("decisions 协议客户端 ↔ catalog 契约", () => {
  it("覆盖 decisions 域全部 HTTP 操作，路径名冻结", async () => {
    const mock = createMockHttp();
    const api = createStatusApi(mock.http);
    mock.nextResponse = { status: 200, data: { host_ready: true, incidents: [], holds: [] } };
    const called = await collectCalls(mock, {
      list: () => api.incidents(),
      resolve: async () => {
        mock.nextResponse = {
          status: 200,
          data: { incident_id: DUMMY_ID, status: "delivered", state: "resolved" },
        };
        return api.resolveIncident(DUMMY_ID, { action: "resume" });
      },
      errorDecisions: async () => {
        mock.nextResponse = { status: 200, data: { items: [] } };
        return api.errorDecisions();
      },
      resolveErrorDecision: async () => {
        mock.nextResponse = { status: 200, data: { decision_id: DUMMY_ID, status: "resolved" } };
        return api.resolveErrorDecision(
          { decision_id: DUMMY_ID, job_id: "job-1", device_id: "heater-1" },
          { action: "retry", reason: "operator" },
        );
      },
    });
    expect(called).toEqual(catalogOps("decisions"));
    expect(catalogOps("decisions")).toEqual(
      new Set([
        "GET /api/v1/status-incidents",
        "POST /api/v1/status-incidents/{}",
        "GET /api/v1/error-decisions",
        "POST /api/v1/error-decisions/{}",
      ]),
    );
    // error decision 提交必须回带 job_id/device_id 并声明 scheduler_updated=true（微后端放行前置条件）
    expect(mock.calls[3]?.data).toEqual({
      scheduler_updated: true,
      job_id: "job-1",
      device_id: "heater-1",
      action: "retry",
      reason: "operator",
    });
  });

  it("GET query 参数：device_id 过滤与 include_terminal 环形缓冲", async () => {
    const mock = createMockHttp();
    const api = createStatusApi(mock.http);
    mock.nextResponse = { status: 200, data: { host_ready: true, incidents: [], holds: [] } };
    await api.incidents({ device_id: "heater-1", include_terminal: true });
    expect(mock.calls[0]?.params).toMatchObject({
      device_id: "heater-1",
      include_terminal: "true",
    });
  });

  it("§10.2 红线：POST body 只透传 Host 下发的 action，原样上送", async () => {
    const mock = createMockHttp();
    const api = createStatusApi(mock.http);
    const state = createMockStatusIncidentState();
    const incident = state.incidents[0]!;
    // mock fixture 自身满足红线：action 只能是冻结枚举，recovery_action 仅
    // execute_recovery 携带（只读展示，由 Host 执行）
    for (const item of state.incidents) {
      for (const option of item.options) {
        expect(["execute_recovery", "resume"]).toContain(option.action);
        if (option.action !== "execute_recovery") {
          expect(option.recovery_action).toBeUndefined();
        }
      }
    }
    mock.nextResponse = {
      status: 200,
      data: { incident_id: incident.incident_id, status: "delivered", state: "recovering" },
    };
    const ack = await api.resolveIncident(incident.incident_id, {
      action: incident.options[0]!.action,
      reason: "operator confirmed",
    });
    expect(mock.calls[0]?.data).toEqual({
      action: "execute_recovery",
      reason: "operator confirmed",
    });
    // §10.3：delivered 只表示受理；state=recovering 表示恢复动作在执行
    expect(ack.status).toBe("delivered");
    expect(ack.state).toBe("recovering");
  });

  it("§2 Host 不可用语义：503 not enabled / 404 终态 / 409 recovering", async () => {
    const mock = createMockHttp();
    const api = createStatusApi(mock.http);

    mock.nextResponse = {
      status: 503,
      data: { detail: "edge execution backend not enabled" },
    };
    await expect(api.incidents()).rejects.toMatchObject({
      status: 503,
      message: "edge execution backend not enabled",
    });

    mock.nextResponse = { status: 404, data: { detail: "incident not found" } };
    await expect(
      api.resolveIncident("gone", { action: "resume" }),
    ).rejects.toBeInstanceOf(ApiError);

    mock.nextResponse = { status: 409, data: { detail: "decision in flight" } };
    await expect(
      api.resolveIncident("busy", { action: "resume" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("host_ready=false 时 incidents/holds 必为空数组（§2）", async () => {
    const mock = createMockHttp();
    const api = createStatusApi(mock.http);
    mock.nextResponse = {
      status: 200,
      data: { host_ready: false, incidents: [], holds: [] },
    };
    const resp = await api.incidents();
    expect(resp.host_ready).toBe(false);
    expect(resp.incidents).toEqual([]);
    expect(resp.holds).toEqual([]);
  });
});

describe("status SSE reducer（§7 事件 × §10 不变量）", () => {
  const mockState = createMockStatusIncidentState();
  const interlock = mockState.incidents[0]!;
  const notify = mockState.incidents[1]!;
  const empty: StatusIncidentPanelState = { incidents: [], holds: [] };

  it("§10.1 required 按 incident_id upsert（重试失败回落/超时提醒不产生重复项）", () => {
    let state = applyStatusMonitorEvent(empty, requiredEvent(interlock, 1));
    expect(state.incidents).toHaveLength(1);
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0]?.hold_token).toBe(interlock.hold_token);

    // 恢复动作失败回落：同 incident_id 重发，attempts_used/options 已更新
    const retried: StatusIncident = {
      ...interlock,
      retry: { ...interlock.retry, attempts_used: 3 },
      options: interlock.options.filter((option) => option.action === "resume"),
      updated_at: interlock.updated_at + 10,
    };
    state = applyStatusMonitorEvent(state, requiredEvent(retried, 2));
    expect(state.incidents).toHaveLength(1);
    expect(state.holds).toHaveLength(1);
    // 重试耗尽后 options 只剩 resume（§4.2 迁移规则）
    expect(state.incidents[0]?.options.map((option) => option.action)).toEqual([
      "resume",
    ]);
    expect(state.incidents[0]?.retry.attempts_used).toBe(3);
  });

  it("mode=notify（hold_token=空串）只建面板项、不产生 hold（§4.1）", () => {
    const state = applyStatusMonitorEvent(empty, requiredEvent(notify, 1));
    expect(state.incidents).toHaveLength(1);
    expect(state.holds).toHaveLength(0);
  });

  it("§10.5 hold 消失以 resolved/cleared 事件为准，按 hold_token 增量移除", () => {
    let state = applyStatusMonitorEvent(empty, requiredEvent(interlock, 1));
    state = applyStatusMonitorEvent(state, requiredEvent(notify, 2));
    expect(state.incidents).toHaveLength(2);
    expect(state.holds).toHaveLength(1);

    // §10.3：POST 受理（delivered）本身不移除面板项——reducer 只认事件
    state = applyStatusMonitorEvent(state, {
      seq: 3,
      ts: 0,
      channel: "status",
      type: "status_incident_resolved",
      data: {
        incident_id: interlock.incident_id,
        policy_id: interlock.policy_id,
        device_id: interlock.device_id,
        property_name: interlock.property_name,
        state: "resolved",
        selected_action: "execute_recovery",
        reason: "operator confirmed",
        hold_token: interlock.hold_token,
        resolved_at: 1_786_440_042,
      },
      trace_id: "",
      span_id: "",
    });
    expect(state.incidents.map((item) => item.incident_id)).toEqual([
      notify.incident_id,
    ]);
    expect(state.holds).toHaveLength(0);

    state = applyStatusMonitorEvent(state, {
      seq: 4,
      ts: 0,
      channel: "status",
      type: "status_incident_cleared",
      data: {
        incident_id: notify.incident_id,
        policy_id: notify.policy_id,
        device_id: notify.device_id,
        property_name: notify.property_name,
        state: "cleared",
        observed_value: "NORMAL",
        hold_token: "",
        cleared_at: 1_786_440_050,
      },
      trace_id: "",
      span_id: "",
    });
    expect(state.incidents).toHaveLength(0);
  });

  it("§10.7 恢复后再告警是新 incident_id：新面板项，不复用旧条目", () => {
    let state = applyStatusMonitorEvent(empty, requiredEvent(interlock, 1));
    state = applyStatusMonitorEvent(state, {
      seq: 2,
      ts: 0,
      channel: "status",
      type: "status_incident_resolved",
      data: { incident_id: interlock.incident_id, hold_token: interlock.hold_token },
      trace_id: "",
      span_id: "",
    });
    const reAlarm: StatusIncident = {
      ...interlock,
      incident_id: "00000000-0000-4000-8000-00000000new1",
      hold_token: "00000000-0000-4000-8000-00000000new2",
    };
    state = applyStatusMonitorEvent(state, requiredEvent(reAlarm, 3));
    expect(state.incidents.map((item) => item.incident_id)).toEqual([
      reAlarm.incident_id,
    ]);
    expect(state.holds.map((hold) => hold.hold_token)).toEqual([
      reAlarm.hold_token,
    ]);
  });

  it("§10.6 seq 连续性守卫：跳号/重连必须重拉 snapshot", () => {
    expect(isConsecutiveStatusSeq(null, requiredEvent(interlock, 7))).toBe(true);
    expect(isConsecutiveStatusSeq(7, requiredEvent(interlock, 8))).toBe(true);
    expect(isConsecutiveStatusSeq(7, requiredEvent(interlock, 9))).toBe(false);
    expect(isConsecutiveStatusSeq(7, requiredEvent(interlock, 7))).toBe(false);
  });

  it("§10.4 超时语义：default_on_timeout 恒为 hold，expires_at 恒 null，前端无默认动作", () => {
    for (const incident of mockState.incidents) {
      expect(incident.default_on_timeout).toBe("hold");
      expect(incident.expires_at).toBeNull();
      expect(incident.require_confirmation).toBe(true);
    }
    // 决策超时的周期提醒 = 同 incident_id 的 required 重发，面板只刷新不动作
    const reminder = applyStatusMonitorEvent(
      applyStatusMonitorEvent(empty, requiredEvent(interlock, 1)),
      requiredEvent({ ...interlock, updated_at: interlock.updated_at + 300 }, 2),
    );
    expect(reminder.incidents).toHaveLength(1);
    expect(reminder.holds).toHaveLength(1);
  });

  it("hold 投影字段与契约 §5 一一对应（scope 完整枚举只有 device/global）", () => {
    const state = applyStatusMonitorEvent(empty, requiredEvent(interlock, 1));
    expect(state.holds[0]).toEqual({
      hold_token: interlock.hold_token,
      incident_id: interlock.incident_id,
      policy_id: interlock.policy_id,
      device_id: interlock.device_id,
      property_name: interlock.property_name,
      scope: interlock.scope,
      reason: interlock.message,
      created_at: interlock.created_at,
    });
    expect(["device", "global"]).toContain(state.holds[0]?.scope);
  });
});