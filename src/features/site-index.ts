/**
 * 前端站点索引（awesome-lab-sites）。
 *
 * 与驱动包索引（`device-index.ts` / awesome-lab-devices）同一套模式：官方目录放在独立仓库
 * https://github.com/Xuwznln/awesome-lab-sites 的 index.json，由**浏览器直接读取**，
 * 列出能连接 Uni-Lab-OS 后端的前端站点——通用 OpenLab、按学科主题进入的入口、社区分发。
 * 顶栏学科切换器旁的「站点」目录用它；后端自己的导航页（`unilab` 管理端口的 `/`）也读同一份。
 *
 * 索引条目的 `url` 可带 `?theme=<学科主题 id>`：本站点启动时读该参数选主题
 * （见 `stores/domain-theme.ts`），所以同一份构建可以在索引里出现多次、各自带不同主题。
 */
import { deviceIndexRepoUrl } from "./device-index";

export const SITE_INDEX_REPO_URL = "https://github.com/Xuwznln/awesome-lab-sites";
export const SITE_INDEX_SCHEMA = "awesome-lab-sites/v1";
/** 构建时可用 VITE_OPENLAB_SITE_INDEX_URL 改默认值（内网镜像 / fork）。 */
export const DEFAULT_SITE_INDEX_URL =
  String(import.meta.env.VITE_OPENLAB_SITE_INDEX_URL || "").trim() ||
  "https://raw.githubusercontent.com/Xuwznln/awesome-lab-sites/main/index.json";
export const SITE_INDEX_FETCH_TIMEOUT_MS = 10_000;
/** 站点 `url` 里选学科主题的 query 参数名。 */
export const SITE_THEME_QUERY_PARAM = "theme";

/** 索引里的一条（index.json sites[]，见仓库 schema.json）。 */
export interface SiteIndexEntry {
  id: string;
  name: string;
  url: string;
  description: string;
  homepage: string;
  theme: string;
  protocol: string;
  tags: string[];
  official: boolean;
}

export interface SiteIndex {
  url: string;
  schema: string;
  name: string;
  updatedAt: string;
  sites: SiteIndexEntry[];
}

/** raw.githubusercontent.com 地址还原成仓库页；其它地址原样返回。 */
export const siteIndexRepoUrl = deviceIndexRepoUrl;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

/** 宽松归一一条索引记录；缺 id / name / url 或 url 不是 https 的条目丢弃。 */
export function normalizeSiteEntry(raw: unknown, defaults: { official: boolean }): SiteIndexEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const id = String(item.id ?? "").trim();
  const name = String(item.name ?? id).trim();
  const url = String(item.url ?? "").trim();
  if (!id || !name || !/^https:\/\//.test(url)) return null;
  return {
    id,
    name,
    url,
    description: String(item.description ?? "").trim(),
    homepage: String(item.homepage ?? "").trim(),
    theme: String(item.theme ?? "").trim(),
    protocol: String(item.protocol ?? "runtime.v1").trim() || "runtime.v1",
    tags: stringList(item.tags),
    official: typeof item.official === "boolean" ? item.official : defaults.official,
  };
}

export function parseSiteIndex(url: string, data: unknown): SiteIndex {
  const root = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const list = Array.isArray(data) ? data : Array.isArray(root.sites) ? root.sites : null;
  if (!list) throw new Error("索引不是 {sites: []} 或数组");
  const schema = String(root.schema ?? "").trim();
  if (schema && schema !== SITE_INDEX_SCHEMA) throw new Error(`索引 schema 不支持：${schema}`);
  const seen = new Set<string>();
  const sites: SiteIndexEntry[] = [];
  for (const item of list) {
    const entry = normalizeSiteEntry(item, { official: true });
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    sites.push(entry);
  }
  return {
    url,
    schema: schema || SITE_INDEX_SCHEMA,
    name: String(root.name ?? "").trim(),
    updatedAt: String(root.updated_at ?? "").trim(),
    sites,
  };
}

export async function fetchSiteIndex(url: string, fetchImpl: typeof fetch = fetch): Promise<SiteIndex> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_INDEX_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseSiteIndex(url, await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`超时（${SITE_INDEX_FETCH_TIMEOUT_MS / 1000}s）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** 站点 `url` 里 `?theme=` 的取值（无 / 非法 URL 为空串）。 */
export function siteEntryTheme(entryUrl: string): string {
  try {
    return new URL(entryUrl).searchParams.get(SITE_THEME_QUERY_PARAM)?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * 站点「部署身份」= origin + pathname（去掉 query 与 hash，`/index.html` 视同目录）。
 * 同一份构建的多个主题入口共享一个身份，靠 `theme` 区分。
 */
export function siteDeploymentKey(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/index\.html$/i, "/");
    return `${parsed.origin}${path.endsWith("/") ? path : `${path}/`}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** 页面当前地址（`location.href`）是否就是索引条目指向的部署。 */
export function isSameDeployment(entryUrl: string, currentHref: string): boolean {
  return siteDeploymentKey(entryUrl) === siteDeploymentKey(currentHref);
}

/**
 * 把当前浏览地址的路径（hash 路由）带到目标站点：同一部署换主题时保留正在看的页面，
 * 跨部署只带上 hash 路由本身（对方若是 OpenLab fork 可直接落到同一页）。
 */
export function siteEntryHref(entryUrl: string, currentHref: string): string {
  try {
    const target = new URL(entryUrl);
    const current = new URL(currentHref);
    if (!target.hash && current.hash) target.hash = current.hash;
    return target.toString();
  } catch {
    return entryUrl;
  }
}
