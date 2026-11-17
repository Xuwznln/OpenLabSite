/**
 * history-v1 域：UniLabOS `history.v1` / `history.db` 的浏览器只读投影（Host 的事件 / 载荷存储）。
 *
 * V1 合同把 `/api/v1/history/*` 让给了工作流运行历史（见 run-history 域），本存储整体搬到
 * `/api/v1/edge/history/*`（Host 专有，经调度权威代理；Host 启动中返回 5001）。DTO 不变。
 */
import type { HttpTransport, JsonObject } from "./common.js";

export type HistoryV1EventType =
  | "job_transition"
  | "action_availability"
  | "job_feedback"
  | "job_result"
  | "job_log"
  | "error_snapshot"
  | "decision_audit";

export interface HistoryV1Payload {
  payload_uuid: string;
  media_type: string;
  encoding: string;
  compression?: string;
  byte_length: number;
  sha256: string;
  storage_kind: "inline" | "external";
  /** Base64 on the HTTP wire. */
  inline_payload?: string;
  external_uri?: string;
  created_at_ms: number;
  expires_at_ms?: number;
}

export interface HistoryV1Event {
  sequence?: number;
  event_uuid: string;
  event_type: HistoryV1EventType;
  job_uuid?: string;
  endpoint_uuid?: string;
  device_uuid?: string;
  action_name?: string;
  event_key?: string;
  job_sequence?: number;
  state_version?: number;
  payload_uuid?: string;
  summary: JsonObject;
  severity?: string;
  actor_type?: string;
  actor_uuid?: string;
  supersedes_event_uuid?: string;
  occurred_at_ms: number;
  recorded_at_ms: number;
}

export interface HistoryV1Query {
  after_sequence?: number;
  limit?: number;
  event_types?: HistoryV1EventType[];
  job_uuid?: string;
  endpoint_uuid?: string;
  device_uuid?: string;
  event_key?: string;
  occurred_from_ms?: number;
  occurred_through_ms?: number;
}

export function createHistoryV1Api(http: HttpTransport) {
  return {
    payload: (payloadUuid: string) =>
      http.request<HistoryV1Payload>({ method: "GET", path: `/api/v1/edge/history/payloads/${encodeURIComponent(payloadUuid)}` }),
    events: (params: HistoryV1Query = {}) =>
      http.request<HistoryV1Event[]>({
        method: "GET",
        path: "/api/v1/edge/history/events",
        params: { ...params },
      }),
    event: (eventUuid: string) =>
      http.request<HistoryV1Event>({ method: "GET", path: `/api/v1/edge/history/events/${encodeURIComponent(eventUuid)}` }),
    replacementChain: (eventUuid: string) =>
      http.request<HistoryV1Event[]>({ method: "GET", path: `/api/v1/edge/history/events/${encodeURIComponent(eventUuid)}/replacement-chain` }),
  };
}

export type HistoryV1Api = ReturnType<typeof createHistoryV1Api>;
