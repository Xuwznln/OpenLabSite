/**
 * 受管设备进程 —— `/api/v1/device-processes`（仅带执行面的 Host 进程挂载）。
 *
 * 「装驱动包」让代码进得来（driver-packages 域），「设备进程」让设备跑起来：
 * 一条受管进程 = 一份 slave 图（一个或多个设备节点）+ 要挂载的驱动包 + 重启策略。
 * Host 用 `python -m unilabos --is_slave --host_node_ip <本机> …` 拉起子进程，子进程经
 * HostLink 接回本 Host；驱动崩了只影响这个子进程并按策略自动拉起，改配置也只需
 * 重启它，Host 本体 / 物料权威 / 调度不受影响。
 */
import type { HttpTransport, JsonObject } from "./common.js";

export type DeviceProcessStatus = "stopped" | "starting" | "running" | "crashed" | "restarting";
export type DeviceProcessRestartPolicy = "never" | "on-failure" | "always";

/** 规格 + 运行态的合并视图（服务端 `_view`）。 */
export interface DeviceProcess {
  id: string;
  name: string;
  /** slave 图的 nodes[]（node-link），由服务写成 graph.json。 */
  graph_nodes: JsonObject[];
  devices_dirs: string[];
  /** 驱动包台账里的分发名，其包目录会以 --devices 挂给子进程。 */
  package_names: string[];
  external_only: boolean;
  auto_start: boolean;
  restart_policy: DeviceProcessRestartPolicy;
  max_restarts: number;
  extra_args: string[];
  created_at_ms: number;
  updated_at_ms: number;
  status: DeviceProcessStatus;
  pid: number | null;
  started_at_ms: number | null;
  stopped_at_ms: number | null;
  last_exit_code: number | null;
  restart_count: number;
  last_error: string | null;
  command: string[];
  log_path: string;
  device_ids: string[];
  graph_path: string;
}

export interface DeviceProcessListing {
  /** 子进程应连接的 HostLink 地址。 */
  hostlink: { host: string; port: number };
  processes: DeviceProcess[];
}

/** 简化的设备节点：id + 注册表类 + 初始化配置，服务补齐 uuid / pose。 */
export interface DeviceNodeInput {
  id: string;
  class: string;
  name?: string;
  config?: JsonObject;
  pose?: JsonObject;
}

export interface DeviceProcessWriteInput {
  name: string;
  /** 新建时用；与 graph_nodes 二选一（graph_nodes 优先，编辑保留 uuid）。 */
  devices?: DeviceNodeInput[];
  graph_nodes?: JsonObject[];
  devices_dirs?: string[];
  package_names?: string[];
  external_only?: boolean;
  auto_start?: boolean;
  restart_policy?: DeviceProcessRestartPolicy;
  max_restarts?: number;
  extra_args?: string[];
}

export interface DeviceClassOption {
  id: string;
  source: "registry" | "package";
  display_name: string;
  /** 来自哪个驱动包（注册表内置类为 null）。 */
  package: string | null;
}

export interface DeviceProcessLogs {
  process_id: string;
  lines: string[];
  path: string;
}

export function createDeviceProcessesApi(http: HttpTransport) {
  const base = "/api/v1/device-processes";
  return {
    /** GET /device-processes —— 全部受管进程（含运行态）。 */
    list: () => http.request<DeviceProcessListing>({ method: "GET", path: base }),
    /** GET /device-processes/device-classes —— 可配置的设备类（注册表 + 驱动包扫描）。 */
    deviceClasses: () => http.request<DeviceClassOption[]>({ method: "GET", path: `${base}/device-classes` }),
    /** POST /device-processes —— 新建（201）。 */
    create: (input: DeviceProcessWriteInput) => http.request<DeviceProcess>({ method: "POST", path: base, body: input }),
    /** GET /device-processes/{id} */
    get: (processId: string) =>
      http.request<DeviceProcess>({ method: "GET", path: `${base}/${encodeURIComponent(processId)}` }),
    /** PUT /device-processes/{id} —— 改规格（运行中的进程需重启生效）。 */
    update: (processId: string, input: DeviceProcessWriteInput) =>
      http.request<DeviceProcess>({ method: "PUT", path: `${base}/${encodeURIComponent(processId)}`, body: input }),
    /** DELETE /device-processes/{id} —— 停止并删除（204）。 */
    remove: (processId: string) =>
      http.request<void>({ method: "DELETE", path: `${base}/${encodeURIComponent(processId)}` }),
    /** POST /device-processes/{id}/start —— 已在运行返回 409。 */
    start: (processId: string) =>
      http.request<DeviceProcess>({ method: "POST", path: `${base}/${encodeURIComponent(processId)}/start` }),
    /** POST /device-processes/{id}/stop */
    stop: (processId: string) =>
      http.request<DeviceProcess>({ method: "POST", path: `${base}/${encodeURIComponent(processId)}/stop` }),
    /** POST /device-processes/{id}/restart */
    restart: (processId: string) =>
      http.request<DeviceProcess>({ method: "POST", path: `${base}/${encodeURIComponent(processId)}/restart` }),
    /** GET /device-processes/{id}/logs?tail= —— 内存尾部日志（完整日志在 log_path）。 */
    logs: (processId: string, tail = 200) =>
      http.request<DeviceProcessLogs>({
        method: "GET",
        path: `${base}/${encodeURIComponent(processId)}/logs`,
        params: { tail },
      }),
  };
}

export type DeviceProcessesApi = ReturnType<typeof createDeviceProcessesApi>;
