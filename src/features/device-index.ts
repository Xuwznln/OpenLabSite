/**
 * 驱动包索引（awesome-lab-devices）。
 *
 * 官方可安装目录放在独立仓库 https://github.com/Xuwznln/awesome-lab-devices 的 index.json，
 * 由**浏览器直接读取**（前端是静态站，索引与前端一起演进，Edge 不需要出网、也不需要配置），
 * 选中条目后把 `spec`（GitHub 仓库地址 / 归档地址，+ `name`）下发给连接中的后端，由它把源码树
 * 下载到 unilabos_data 并用 uv 预装依赖（不 pip install 包体）。
 *
 * 后端自己的 `GET /driver-packages/catalog`（Edge 侧内网镜像 + 本地 driver_package_catalog.json）
 * 作为补充来源合并展示；同名以浏览器读到的官方索引为准。
 */
import type { DriverPackageCatalog, DriverPackageCatalogEntry } from "@openlab/protocol";

export const DEVICE_INDEX_REPO_URL = "https://github.com/Xuwznln/awesome-lab-devices";
export const DEVICE_INDEX_SCHEMA = "awesome-lab-devices/v1";
export const DEVICE_INDEX_STORAGE_KEY = "openlab:device-index-url";
/** 构建时可用 VITE_OPENLAB_DEVICE_INDEX_URL 改默认值（内网镜像 / fork）。 */
export const DEFAULT_DEVICE_INDEX_URL =
  String(import.meta.env.VITE_OPENLAB_DEVICE_INDEX_URL || "").trim() ||
  "https://raw.githubusercontent.com/Xuwznln/awesome-lab-devices/main/index.json";
export const DEVICE_INDEX_FETCH_TIMEOUT_MS = 10_000;

/** 索引里的一条（index.json packages[]，见仓库 schema.json）。 */
export interface DeviceIndexEntry {
  name: string;
  spec: string;
  version: string;
  description: string;
  homepage: string;
  devices: string[];
  tags: string[];
  official: boolean;
  category: string;
}

export interface DeviceIndex {
  url: string;
  schema: string;
  name: string;
  updatedAt: string;
  packages: DeviceIndexEntry[];
}

/** 目录面板的一行：索引条目 / Edge 侧镜像条目 / Edge 本地文件条目统一形状。 */
export interface CatalogRow extends DeviceIndexEntry {
  source: "index" | "edge-remote" | "edge-local";
  /** 后端台账里已有同名包（大小写、-/_ 不敏感）。 */
  installed: boolean;
}

export interface CatalogSourceStatus {
  kind: "index" | "edge-remote" | "edge-local";
  location: string;
  ok: boolean;
  count: number;
  error?: string;
  missing?: boolean;
}

/** 与后端台账一致的分发名归一：小写、`-` → `_`。 */
export function normalizePackageName(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, "_");
}

export function readDeviceIndexUrl(storage: Pick<Storage, "getItem"> | null = safeStorage()): string {
  const stored = storage?.getItem(DEVICE_INDEX_STORAGE_KEY)?.trim();
  return stored || DEFAULT_DEVICE_INDEX_URL;
}

/** 空串 = 恢复默认。 */
export function saveDeviceIndexUrl(url: string, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): string {
  const value = url.trim();
  if (!value || value === DEFAULT_DEVICE_INDEX_URL) {
    storage?.removeItem(DEVICE_INDEX_STORAGE_KEY);
    return DEFAULT_DEVICE_INDEX_URL;
  }
  storage?.setItem(DEVICE_INDEX_STORAGE_KEY, value);
  return value;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * raw.githubusercontent.com/<owner>/<repo>/<ref>/<path> → 仓库页；其它地址原样返回，
 * 让「索引」链接总能点到人能看的地方。
 */
export function deviceIndexRepoUrl(indexUrl: string): string {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(indexUrl.trim());
  if (match) return `https://github.com/${match[1]}/${match[2]}${match[3] === "main" ? "" : `/tree/${match[3]}`}`;
  return indexUrl;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

/** 宽松归一一条索引记录；缺 name / spec 的条目丢弃。 */
export function normalizeIndexEntry(raw: unknown, defaults: { official: boolean }): DeviceIndexEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const name = String(item.name ?? "").trim();
  const spec = String(item.spec ?? name).trim();
  if (!name || !spec) return null;
  return {
    name,
    spec,
    version: String(item.version ?? "").trim(),
    description: String(item.description ?? "").trim(),
    homepage: String(item.homepage ?? "").trim(),
    devices: stringList(item.devices),
    tags: stringList(item.tags),
    official: typeof item.official === "boolean" ? item.official : defaults.official,
    category: String(item.category ?? "").trim(),
  };
}

export function parseDeviceIndex(url: string, data: unknown): DeviceIndex {
  const root = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const list = Array.isArray(data) ? data : Array.isArray(root.packages) ? root.packages : null;
  if (!list) throw new Error("索引不是 {packages: []} 或数组");
  const schema = String(root.schema ?? "").trim();
  if (schema && schema !== DEVICE_INDEX_SCHEMA) throw new Error(`索引 schema 不支持：${schema}`);
  return {
    url,
    schema: schema || DEVICE_INDEX_SCHEMA,
    name: String(root.name ?? "").trim(),
    updatedAt: String(root.updated_at ?? "").trim(),
    packages: list.map((item) => normalizeIndexEntry(item, { official: true })).filter((item): item is DeviceIndexEntry => item !== null),
  };
}

export async function fetchDeviceIndex(url: string, fetchImpl: typeof fetch = fetch): Promise<DeviceIndex> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_INDEX_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseDeviceIndex(url, await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`超时（${DEVICE_INDEX_FETCH_TIMEOUT_MS / 1000}s）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function fromEdgeEntry(entry: DriverPackageCatalogEntry): DeviceIndexEntry {
  return {
    name: entry.name,
    spec: entry.spec,
    version: entry.version,
    description: entry.description,
    homepage: entry.homepage,
    devices: entry.devices,
    tags: entry.tags,
    official: entry.official,
    category: "",
  };
}

/**
 * 合并三个来源：浏览器读到的索引 → Edge 侧镜像 → Edge 本地文件；同名只保留先出现的。
 * `installed` 按后端台账里的包名判定（索引里的 installed 标记不可信，它不知道台账）。
 */
export function mergeCatalog(
  index: DeviceIndex | null,
  edge: DriverPackageCatalog | null,
  installedNames: Iterable<string>,
): { rows: CatalogRow[]; sources: CatalogSourceStatus[] } {
  const installed = new Set(Array.from(installedNames, normalizePackageName));
  const seen = new Set<string>();
  const rows: CatalogRow[] = [];
  const push = (entry: DeviceIndexEntry, source: CatalogRow["source"]) => {
    const key = normalizePackageName(entry.name);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ...entry, source, installed: installed.has(key) });
  };
  for (const entry of index?.packages ?? []) push(entry, "index");
  const edgeSources: CatalogSourceStatus[] = [];
  for (const source of edge?.sources ?? []) {
    const kind = source.kind === "remote" ? "edge-remote" : "edge-local";
    for (const entry of edge?.packages ?? []) if (entry.source === source.kind) push(fromEdgeEntry(entry), kind);
    edgeSources.push({ kind, location: source.location, ok: source.ok, count: source.count, error: source.error, missing: source.missing });
  }
  return { rows, sources: edgeSources };
}

export function filterRows(rows: CatalogRow[], query: string): CatalogRow[] {
  const text = query.trim().toLowerCase();
  if (!text) return rows;
  return rows.filter((row) => [row.name, row.description, row.spec, row.category, ...row.devices, ...row.tags].join(" ").toLowerCase().includes(text));
}
