/**
 * device-state 域：V1 设备状态视图（unilabos/server/api/runtime/device_state.py）。
 *
 * 数据在 Host 的 telemetry.db（Host 专有，经调度权威代理；Host 启动中 5001）。只记录标量属性，
 * 值变化时追加一条历史。dev 更完整的遥测读面仍是 telemetry-v1 域。`POST /device-state/report`
 * 是设备侧写入（控制面），不在浏览器目录里。
 */
import type { HttpTransport, JsonObject } from "./common.js";

export interface DeviceStateSnapshot extends JsonObject {}
export interface DeviceStateHistory extends JsonObject {}

export function createDeviceStateApi(http: HttpTransport) {
  return {
    /** 全量设备属性当前值 + 存储统计。 */
    all: () => http.request<DeviceStateSnapshot>({ method: "GET", path: "/api/v1/device-state" }),
    /** 跨设备 / 属性的最近变化点（新 → 旧）。 */
    history: (params: { since_ms?: number; limit?: number } = {}) =>
      http.request<DeviceStateHistory>({ method: "GET", path: "/api/v1/device-state/history", params }),
    /** 单台设备的属性当前值；没有记录 4001。 */
    device: (deviceId: string) =>
      http.request<DeviceStateSnapshot>({ method: "GET", path: `/api/v1/device-state/${encodeURIComponent(deviceId)}` }),
    /** 单属性变化轨迹（新 → 旧）。 */
    propertyHistory: (deviceId: string, property: string, params: { since_ms?: number; limit?: number } = {}) =>
      http.request<DeviceStateHistory>({
        method: "GET",
        path: `/api/v1/device-state/${encodeURIComponent(deviceId)}/history`,
        params: { property, ...params },
      }),
  };
}

export type DeviceStateApi = ReturnType<typeof createDeviceStateApi>;
