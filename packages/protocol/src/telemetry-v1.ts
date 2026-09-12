/** Browser-safe read projection of UniLabOS `telemetry.v1` / `telemetry.db`. */
import type { HttpTransport, JsonObject, JsonValue } from "./common.js";

export type TelemetryV1EventType = "state" | "property_sample" | "connection" | "alarm";

export interface TelemetryV1Event {
  sequence?: number;
  event_uuid: string;
  endpoint_uuid: string;
  device_uuid?: string;
  source_epoch: string;
  source_generation: number;
  source_sequence: number;
  event_type: TelemetryV1EventType;
  event_key?: string;
  payload: JsonValue;
  payload_hash: string;
  severity?: string;
  source_job_uuid?: string;
  source_command_uuid?: string;
  observed_at_ms: number;
  received_at_ms: number;
}

export interface TelemetryV1SourceCursor {
  endpoint_uuid: string;
  source_epoch: string;
  source_generation: number;
  source_sequence: number;
  last_event_uuid?: string;
  last_received_at_ms: number;
  version: number;
}

export interface TelemetryV1DeviceState {
  endpoint_uuid: string;
  device_uuid: string;
  source_event_uuid: string;
  source_epoch: string;
  source_generation: number;
  source_sequence: number;
  state: JsonObject;
  properties: JsonObject;
  connection_state: "online" | "offline" | "degraded" | "unknown";
  alarms: JsonObject[];
  state_hash: string;
  observed_at_ms: number;
  received_at_ms: number;
  version: number;
}

export interface TelemetryV1Query {
  after_sequence?: number;
  endpoint_uuid?: string;
  device_uuid?: string;
  event_type?: TelemetryV1EventType;
  source_epoch?: string;
  source_generation?: number;
  observed_from_ms?: number;
  observed_to_ms?: number;
  limit?: number;
}

export function createTelemetryV1Api(http: HttpTransport) {
  return {
    events: (params: TelemetryV1Query = {}) =>
      http.request<TelemetryV1Event[]>({
        method: "GET",
        path: "/api/v1/telemetry/events",
        params: { ...params },
      }),
    event: (eventUuid: string) =>
      http.request<TelemetryV1Event>({ method: "GET", path: `/api/v1/telemetry/events/${encodeURIComponent(eventUuid)}` }),
    sourceCursor: (endpointUuid: string) =>
      http.request<TelemetryV1SourceCursor>({ method: "GET", path: `/api/v1/telemetry/sources/${encodeURIComponent(endpointUuid)}/cursor` }),
    states: (endpointUuid?: string) =>
      http.request<TelemetryV1DeviceState[]>({ method: "GET", path: "/api/v1/telemetry/states", params: { endpoint_uuid: endpointUuid } }),
    state: (endpointUuid: string, deviceUuid: string) =>
      http.request<TelemetryV1DeviceState>({ method: "GET", path: `/api/v1/telemetry/states/${encodeURIComponent(endpointUuid)}/${encodeURIComponent(deviceUuid)}` }),
  };
}

export type TelemetryV1Api = ReturnType<typeof createTelemetryV1Api>;
