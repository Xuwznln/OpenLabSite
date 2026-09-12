/**
 * 驱动包（设备包）管理 —— `/api/v1/driver-packages`（仅带执行面的 Host 进程挂载）。
 *
 * 驱动包 = 含 `@device` / `@resource` 的 Python **源码树**，与 `unilab --devices <目录>` 同一套机制，
 * 不经 pip 安装包体：
 *
 * - 来源是 GitHub 仓库地址（`https://github.com/<owner>/<repo>[@ref]`）、zip / tar.gz 归档地址或本机目录；
 * - 远端来源下载解压到 `unilabos_data/driver_packages/<name>/<version>/`，本机目录原地登记；
 * - 源码树 `pyproject.toml` 的 `[project].dependencies` 用 uv（回退 pip）预装进 Host 解释器；
 * - 台账 `unilabos_data/driver_packages.json` 记录来源 / 版本 / sha256 / 要挂载的包目录 / 设备类；
 *   已启用的包目录在**下次启动**并入 `--devices` 扫描。完整流程：
 *
 *   install（202，后台 operation）→ 轮询 operation 到 succeeded
 *   → `restart_required` 为 true → `system.requestRestart({ mode: "quiescent", scope: "process" })`
 *   → 等 health 恢复 → inventory 里 `mounted` / `loaded_device_ids` 变为真。
 *
 * 安装 / 卸载不在请求内同步执行：下载与依赖安装可能跑几分钟，用 operation 记录进度与日志。
 */
import type { HttpTransport, JsonObject } from "./common.js";
import type { DeviceProcess } from "./device-processes.js";

export type DriverPackageOperationKind = "install" | "uninstall";
export type DriverPackageOperationStatus = "running" | "succeeded" | "failed";
export type DriverPackageSourceKind = "github" | "archive" | "local";

export interface DriverPackage {
  /** 包名（pyproject `[project].name`；没有 pyproject 时是仓库名 / 请求给的 name）。 */
  name: string;
  /** 安装来源（GitHub 仓库地址 / 归档地址 / 本机目录）。 */
  spec: string;
  version: string;
  source_kind: DriverPackageSourceKind | (string & {});
  /** 源码树根目录（含 pyproject.toml）；local 来源即用户给的目录。 */
  package_root: string;
  /** 顶层包目录（并入 --devices 扫描的路径，父目录进 sys.path）。 */
  package_dirs: string[];
  /** 安装后 AST 扫描到的 @device id。 */
  device_ids: string[];
  /** 预装的第三方依赖（pyproject dependencies，去掉 unilabos 本体）。 */
  dependencies: string[];
  /** 归档 sha256；本机目录为空串。 */
  sha256: string;
  /** 下次启动是否挂载。 */
  enabled: boolean;
  /** 依赖用什么装的：uv / pip；无依赖为空串。 */
  installer: string;
  installed_at_ms: number;
  updated_at_ms: number;
  /** 包目录仍存在。 */
  dirs_exist: boolean;
  /** 当前进程已把它的目录纳入扫描（即本次启动已生效）。 */
  mounted: boolean;
  /** device_ids 中已出现在当前注册表里的部分。 */
  loaded_device_ids: string[];
}

export interface DriverPackageOperation {
  operation_id: string;
  kind: DriverPackageOperationKind;
  spec: string;
  status: DriverPackageOperationStatus;
  package_name: string;
  started_at_ms: number;
  finished_at_ms: number | null;
  /** 下载 / 解压 / 依赖安装 / 扫描日志（尾部 20 KB）。 */
  log: string;
  error: string | null;
  result: Record<string, unknown> | null;
}

export interface DriverPackageInventory {
  /** 依赖装进的解释器。 */
  python: { executable: string; version: string };
  working_dir: string;
  /** 远端来源落盘的根目录：`<working_dir>/driver_packages`。 */
  packages_root: string;
  ledger_path: string;
  /** 本次启动实际扫描的设备目录（CLI --devices + 已启用驱动包）。 */
  scan_dirs: string[];
  /** --external_devices_only：只加载外部包、跳过内置注册表。 */
  external_only: boolean;
  /** 台账自本次启动后有变化，需要重启进程才生效。 */
  restart_required: boolean;
  packages: DriverPackage[];
  /** 最近 5 条操作（完整列表用 operations()）。 */
  operations: DriverPackageOperation[];
}

export interface DriverPackageInstallInput {
  /** 安装来源：`https://github.com/<owner>/<repo>[@ref]`、zip / tar.gz 归档地址或本机目录。 */
  spec: string;
  /** 缺省 true：装完即启用（下次启动挂载）。 */
  enable?: boolean;
  /** 缺省 false；true 时重新下载源码树并以 --upgrade 重装其依赖。 */
  upgrade?: boolean;
  /** 已知的包名（索引条目自带 `name`）；源码树没有 pyproject 时微后端用它登记。 */
  name?: string;
}

/** 官方 / 社区目录里的一条可安装项（`spec` 是安装来源，直接喂给 install）。 */
export interface DriverPackageCatalogEntry {
  name: string;
  /** GitHub 仓库地址或归档地址。 */
  spec: string;
  version: string;
  description: string;
  homepage: string;
  devices: string[];
  tags: string[];
  official: boolean;
  source: "remote" | "local";
  /** 台账里已有同名包。 */
  installed: boolean;
}

export interface DriverPackageCatalogSource {
  kind: "remote" | "local";
  location: string;
  ok: boolean;
  count: number;
  error?: string;
  /** 本地目录文件不存在（正常，可选）。 */
  missing?: boolean;
}

export interface DriverPackageCatalog {
  sources: DriverPackageCatalogSource[];
  packages: DriverPackageCatalogEntry[];
}

/**
 * 驱动包随包的设备图（示例包的 demo 图）。
 *
 * 包把图作为 setuptools data-files 装到 `share/<包>/graph/*.json`（源码 / editable 安装则在
 * 仓库 `graph/`），微后端安装后就能枚举；`device_only` 的图可直接作为受管设备进程启动。
 */
export interface DriverPackageGraph {
  /** 文件名（不含 .json），启动时用它定位。 */
  name: string;
  path: string;
  /** dist = 已安装分发的 data-files；source = 源码目录。 */
  source: "dist" | "source";
  /** 全部节点都是设备节点：可以直接 launch；含物料节点的图只能作为 `-g` 启动图。 */
  device_only: boolean;
  devices: { id: string; class: string }[];
}

export interface DriverPackageGraphLaunch {
  /** true = 新建了受管进程；false = 复用同名进程（`<包>/<图>`），规格已更新并重启。 */
  created: boolean;
  process: DeviceProcess;
}

export function createDriverPackagesApi(http: HttpTransport) {
  const base = "/api/v1/driver-packages";
  return {
    /** GET /driver-packages —— 台账 + 运行态（扫描目录、是否需重启）。 */
    inventory: () => http.request<DriverPackageInventory>({ method: "GET", path: base }),
    /** GET /driver-packages/catalog —— 官方 / 社区目录（远程索引 + 本地补充）。 */
    catalog: () => http.request<DriverPackageCatalog>({ method: "GET", path: `${base}/catalog` }),
    /** POST /driver-packages/install —— 202，返回 running 的 operation。 */
    install: (input: DriverPackageInstallInput) =>
      http.request<DriverPackageOperation>({
        method: "POST",
        path: `${base}/install`,
        body: { spec: input.spec, enable: input.enable ?? true, upgrade: input.upgrade ?? false, name: input.name ?? "" },
      }),
    /** GET /driver-packages/operations —— 最近 30 条操作，新的在前。 */
    operations: () => http.request<DriverPackageOperation[]>({ method: "GET", path: `${base}/operations` }),
    /** GET /driver-packages/operations/{id} —— 轮询进度与日志。 */
    operation: (operationId: string) =>
      http.request<DriverPackageOperation>({
        method: "GET",
        path: `${base}/operations/${encodeURIComponent(operationId)}`,
      }),
    /** PUT /driver-packages/{name}/enabled —— 启停（下次启动生效）。 */
    setEnabled: (name: string, enabled: boolean) =>
      http.request<DriverPackage>({
        method: "PUT",
        path: `${base}/${encodeURIComponent(name)}/enabled`,
        body: { enabled },
      }),
    /** DELETE /driver-packages/{name} —— 202，删除 unilabos_data 里的源码树（本机目录只移出台账）。 */
    uninstall: (name: string) =>
      http.request<DriverPackageOperation>({ method: "DELETE", path: `${base}/${encodeURIComponent(name)}` }),
    /** GET /driver-packages/{name}/graphs —— 随包设备图（demo 图）。 */
    graphs: (name: string) =>
      http.request<DriverPackageGraph[]>({ method: "GET", path: `${base}/${encodeURIComponent(name)}/graphs` }),
    /** GET /driver-packages/{name}/graphs/{graph} —— 图的 node-link 载荷。 */
    graph: (name: string, graphName: string) =>
      http.request<JsonObject>({
        method: "GET",
        path: `${base}/${encodeURIComponent(name)}/graphs/${encodeURIComponent(graphName)}`,
      }),
    /**
     * POST /driver-packages/{name}/graphs/{graph}/launch —— 把随包图作为受管设备进程拉起。
     * 同名进程（`<包>/<图>`）已存在则更新规格后重启，所以反复点是幂等的。
     */
    launchGraph: (name: string, graphName: string) =>
      http.request<DriverPackageGraphLaunch>({
        method: "POST",
        path: `${base}/${encodeURIComponent(name)}/graphs/${encodeURIComponent(graphName)}/launch`,
      }),
  };
}

export type DriverPackagesApi = ReturnType<typeof createDriverPackagesApi>;
