/**
 * OpenLab Edge 客户端门面：按「单协议域单文件」组装各域客户端。
 *
 * - 传输层：axios（common.ts createHttpTransport），非 2xx 归一为 ApiError。
 * - 每个域的类型与客户端实现内聚在各自文件，与微后端路由模块一一对应：
 *     common.ts           ↔ server/api/runtime/diagnostics.py（system 域）
 *     runtime-v1.ts       ↔ server/api/runtime/data.py
 *     workflow-backend.ts ↔ server/api/runtime/workflow.py
 *     registry.ts         ↔ server/api/runtime/registry.py
 *     materials-v1.ts     ↔ server/api/materials/core.py
 *     graphs-v1.ts        ↔ server/api/materials/graph.py
 *     telemetry-v1.ts     ↔ server/api/telemetry.py
 *     history-v1.ts       ↔ server/api/history.py
 *     status.ts           ↔ server/api/runtime/diagnostics.py（decisions 域）
 *     driver-packages.ts  ↔ server/api/driver_packages.py
 *     device-processes.ts ↔ server/api/device_processes.py
 *     lab-v1.ts           ↔ server/api/runtime/lab.py
 *     debug.ts            ↔ server/api/debug.py
 * - 应用代码经 `api.domains.<domain>` 访问；不再提供扁平别名。
 */
import {
  createHttpTransport,
  createSystemApi,
  type HttpTransport,
  type HttpTransportOptions,
} from "./common.js";
import { createDebugApi } from "./debug.js";
import { createDeviceProcessesApi } from "./device-processes.js";
import { createDriverPackagesApi } from "./driver-packages.js";
import { createGraphsV1Api } from "./graphs-v1.js";
import { createHistoryV1Api } from "./history-v1.js";
import { createLabV1Api } from "./lab-v1.js";
import { createMaterialsV1Api } from "./materials-v1.js";
import { createRegistryApi } from "./registry.js";
import { createRuntimeV1Api } from "./runtime-v1.js";
import { createDecisionsApi } from "./status.js";
import { createTelemetryV1Api } from "./telemetry-v1.js";
import { createWorkflowBackendApi } from "./workflow-backend.js";

export { ApiError, BackendBusinessError } from "./common.js";

export type EdgeApiOptions = HttpTransportOptions;

export interface EdgeApiDomains {
  system: ReturnType<typeof createSystemApi>;
  runtimeV1: ReturnType<typeof createRuntimeV1Api>;
  /** Workflow Authority：定义 / Graph / Task / Node Job / Authoring。 */
  workflowBackend: ReturnType<typeof createWorkflowBackendApi>;
  /** Registry Authority：默认本机调度 Host 与 `--role backend` 调度权威进程均提供；接入远端调度权威的受控 Edge 不挂载本域并返回 404。 */
  registry: ReturnType<typeof createRegistryApi>;
  materialsV1: ReturnType<typeof createMaterialsV1Api>;
  graphsV1: ReturnType<typeof createGraphsV1Api>;
  telemetryV1: ReturnType<typeof createTelemetryV1Api>;
  historyV1: ReturnType<typeof createHistoryV1Api>;
  /** 人工决策：status-incidents / error-decisions（仅带执行面的 Host）。 */
  decisions: ReturnType<typeof createDecisionsApi>;
  /** 驱动包安装台账（仅带执行面的 Host；`--role backend` 返回 404）。 */
  driverPackages: ReturnType<typeof createDriverPackagesApi>;
  /** 受管设备进程：本机 Slave 子进程的配置与生命周期（仅 Host）。 */
  deviceProcesses: ReturnType<typeof createDeviceProcessesApi>;
  /** 实验室布局（区域 / 围墙像素格），一个 Host 一份，所有浏览器共享。 */
  labV1: ReturnType<typeof createLabV1Api>;
  debug: ReturnType<typeof createDebugApi>;
}

export function createEdgeApi(baseUrl: string, options: EdgeApiOptions = {}) {
  const http: HttpTransport = createHttpTransport(baseUrl, options);
  const domains: EdgeApiDomains = {
    system: createSystemApi(http),
    runtimeV1: createRuntimeV1Api(http),
    workflowBackend: createWorkflowBackendApi(http),
    registry: createRegistryApi(http),
    materialsV1: createMaterialsV1Api(http),
    graphsV1: createGraphsV1Api(http),
    telemetryV1: createTelemetryV1Api(http),
    historyV1: createHistoryV1Api(http),
    decisions: createDecisionsApi(http),
    driverPackages: createDriverPackagesApi(http),
    deviceProcesses: createDeviceProcessesApi(http),
    labV1: createLabV1Api(http),
    debug: createDebugApi(http),
  };

  return {
    /** 分域命名空间：api.domains.materialsV1.instances() 等。 */
    domains,
    /** 传输层（构造 SSE URL、注入拦截器等场景）。 */
    http,
    /** GET /api/v1/health（连接探测快捷入口）。 */
    health: domains.system.health,
  };
}

export type EdgeApi = ReturnType<typeof createEdgeApi>;
