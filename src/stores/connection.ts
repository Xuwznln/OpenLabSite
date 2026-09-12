/**
 * 连接管理：微后端地址（localStorage 持久化）+ 健康轮询 + 进程角色识别。
 *
 * `/api/v1/health` 同时给出两个维度，页面据此决定哪些能力可用：
 * - `scheduler`：local = 本进程持有 Workflow Authority；remote = 已接入云端，
 *   工作流写入口不在本进程；
 * - `execution`：ready = 本进程带设备执行面（HostNode、遥测、人工决策）；
 *   disabled = 纯调度权威进程（`unilab --role backend`）。
 *
 * Registry Authority 只在 backend 角色进程挂载，用一次 GET 探测并缓存结果。
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { ApiError, createEdgeApi, type EdgeApi, type HealthResponse } from "@openlab/protocol";
import { bindWorkflowInvalidations } from "../features/workflow-invalidation";
import { describeError, isOfflineError } from "../features/errors";
import { classifyTarget } from "../features/insecure-target";

const STORAGE_KEY = "openlab:base-url";
const LEGACY_STORAGE_KEYS = ["unilab-edge-ui:base-url"];
const RECENT_KEY = "openlab:recent-base-urls";

export const DEFAULT_LOCAL_EDGE_URL = "http://127.0.0.1:8002";

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export type NoticeState = "unsupported" | "connecting" | "live" | "retry";
export type CapabilityState = "unknown" | "available" | "unsupported";

/**
 * 通用 SSE 失效通知通道：事件只触发 revision 自增（去抖 100ms），
 * 数据正文始终由订阅方重新经 HTTP 读取。不同消息域各建一条通道。
 */
function createNoticeChannel(
  resolveUrl: () => string,
  bind: (source: EventSource, invalidate: () => void) => () => void,
) {
  const revision = ref(0);
  const state = ref<NoticeState>(
    typeof EventSource === "undefined" ? "unsupported" : "connecting",
  );
  let source: EventSource | null = null;
  let unbind: (() => void) | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function signal() {
    if (debounce !== null) return;
    debounce = setTimeout(() => {
      debounce = null;
      revision.value += 1;
    }, 100);
  }

  function start() {
    if (source || typeof EventSource === "undefined") return;
    state.value = "connecting";
    source = new EventSource(resolveUrl());
    source.onopen = () => {
      state.value = "live";
      // 建连/重连后必须重新经 HTTP 校准，不能把通知 payload 当成数据真相。
      signal();
    };
    source.onerror = () => {
      state.value = "retry";
    };
    unbind = bind(source, signal);
  }

  function stop() {
    unbind?.();
    unbind = null;
    source?.close();
    source = null;
    if (debounce !== null) {
      clearTimeout(debounce);
      debounce = null;
    }
    state.value = typeof EventSource === "undefined" ? "unsupported" : "connecting";
  }

  return { revision, state, start, stop, signal };
}

const MATERIALS_INVALIDATION_EVENT = "materials.changed";

function bindMaterialsInvalidations(
  source: EventSource,
  invalidate: () => void,
): () => void {
  const listener: EventListener = () => invalidate();
  source.addEventListener(MATERIALS_INVALIDATION_EVENT, listener);
  return () => source.removeEventListener(MATERIALS_INVALIDATION_EVENT, listener);
}

const CONFIGURED_BASE_URL = normalizeBaseUrl(
  String(import.meta.env.VITE_DEFAULT_EDGE_URL || ""),
);
/** 页面自身的 origin（显式配置了 Vite 代理，或前端与 API 被同一反向代理托管时，/api 就在这里）。 */
export const PAGE_ORIGIN = normalizeBaseUrl(window.location.origin);
/** Vite dev 代理把 /api 转发到的微后端地址；未配置 OPENLAB_EDGE_PROXY_TARGET 或生产构建为空串。 */
export const DEV_PROXY_TARGET: string =
  typeof __OPENLAB_DEV_PROXY_TARGET__ === "string" ? normalizeBaseUrl(__OPENLAB_DEV_PROXY_TARGET__) : "";
/** 默认直连微后端；只有显式配置了代理目标（远程 / HTTPS 场景）才走页面同源。 */
const DEV_PROXY_ACTIVE = import.meta.env.DEV && DEV_PROXY_TARGET !== "" && !CONFIGURED_BASE_URL;
const DEFAULT_BASE_URL =
  CONFIGURED_BASE_URL || (DEV_PROXY_ACTIVE ? PAGE_ORIGIN : DEFAULT_LOCAL_EDGE_URL);

/**
 * 首次访问且页面不是由 Vite dev 提供时，探测「页面同源是否就是微后端」
 * （前端与 /api 被同一反向代理托管的部署）。命中则无需用户填任何地址。
 */
async function detectSameOriginBackend(): Promise<boolean> {
  if (import.meta.env.DEV || !/^https?:/.test(PAGE_ORIGIN)) return false;
  try {
    // 同源探测也必须经过协议包：路由、错误归一化和响应类型都由
    // @openlab/protocol 的 system 域维护，页面层不再自行拼接 /api/v1 路径。
    const result = await createEdgeApi(PAGE_ORIGIN).health({ timeoutMs: 1_500 });
    return result.status === "ok";
  } catch {
    return false;
  }
}

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export const useConnectionStore = defineStore("connection", () => {
  const legacyUrl = LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  const storedUrl = localStorage.getItem(STORAGE_KEY);
  let initialUrl = normalizeBaseUrl(storedUrl ?? legacyUrl ?? DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
  // 旧版本在开发模式默认走 dev 代理（页面同源）；代理如今默认关闭，这个残留地址
  // 在 dev server 上永远打不到 /api，直接回到直连默认值。
  if (import.meta.env.DEV && !DEV_PROXY_ACTIVE && initialUrl === PAGE_ORIGIN) {
    initialUrl = DEFAULT_BASE_URL;
    localStorage.setItem(STORAGE_KEY, initialUrl);
  }
  if (!storedUrl) localStorage.setItem(STORAGE_KEY, initialUrl);

  const baseUrl = ref(initialUrl);
  /** 页面同源本身就是微后端（dev 代理或 --ui_dir 托管）；决定「默认地址」是什么。 */
  const sameOriginBackend = ref(DEV_PROXY_ACTIVE);
  const defaultUrl = computed(() => (sameOriginBackend.value ? PAGE_ORIGIN : DEFAULT_BASE_URL));
  /** 当前地址就是页面自身的 origin（dev 代理 / 微后端托管），此时地址由托管方决定。 */
  const sameOrigin = computed(() => baseUrl.value === PAGE_ORIGIN);
  /** 开发代理生效：/api 由 Vite 转发到 DEV_PROXY_TARGET。 */
  const devProxyActive = computed(() => DEV_PROXY_ACTIVE && sameOrigin.value);
  const recentUrls = ref<string[]>(readRecent());
  const online = ref(false);
  const health = ref<HealthResponse | null>(null);
  const lastError = ref("");
  const checking = ref(false);
  const lastCheckedAt = ref(0);
  const registrySupport = ref<CapabilityState>("unknown");

  const api = computed<EdgeApi>(() => createEdgeApi(baseUrl.value));

  /** 本进程是否持有 Workflow Authority（可创建/编辑/运行工作流）。 */
  const schedulerLocal = computed(() => online.value && health.value?.scheduler !== "remote");
  /** 本进程是否带设备执行面（设备目录、遥测、人工决策）。 */
  const executionReady = computed(() => online.value && health.value?.execution === "ready");
  /** 进程角色文案。 */
  const roleLabel = computed(() => {
    if (!online.value) return "未连接";
    if (!executionReady.value) return "调度权威进程";
    return schedulerLocal.value ? "Host（本机调度）" : "Host（云端调度）";
  });

  // ── 失效通知通道（SSE；数据真相仍是 HTTP） ──────────────────
  const workflowChannel = createNoticeChannel(
    () => api.value.domains.workflowBackend.eventsUrl(),
    (source, invalidate) => bindWorkflowInvalidations(source, invalidate),
  );
  const materialsChannel = createNoticeChannel(
    () => api.value.domains.materialsV1.eventsUrl(),
    bindMaterialsInvalidations,
  );
  const noticeChannels = [workflowChannel, materialsChannel];

  const workflowNoticeRevision = workflowChannel.revision;
  const workflowNoticeState = workflowChannel.state;
  const materialsNoticeRevision = materialsChannel.revision;
  const materialsNoticeState = materialsChannel.state;

  function rememberRecent(url: string) {
    const next = [url, ...recentUrls.value.filter((item) => item !== url)].slice(0, 6);
    recentUrls.value = next;
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  function setBaseUrl(url: string) {
    const next = normalizeBaseUrl(url) || DEFAULT_BASE_URL;
    baseUrl.value = next;
    localStorage.setItem(STORAGE_KEY, next);
    rememberRecent(next);
  }

  let registryProbePending = false;

  async function probeRegistry() {
    if (registryProbePending || registrySupport.value !== "unknown") return;
    registryProbePending = true;
    try {
      await api.value.domains.registry.entries();
      registrySupport.value = "available";
    } catch (error) {
      if (error instanceof ApiError && error.isUnsupported) {
        registrySupport.value = "unsupported";
      }
    } finally {
      registryProbePending = false;
    }
  }

  async function checkHealth(): Promise<boolean> {
    checking.value = true;
    try {
      const result = await api.value.health();
      health.value = result;
      online.value = result.status === "ok";
      lastError.value = "";
      if (online.value) {
        rememberRecent(baseUrl.value);
        void probeRegistry();
      }
      return online.value;
    } catch (err) {
      online.value = false;
      health.value = null;
      lastError.value =
        isOfflineError(err) && classifyTarget(baseUrl.value) === "blocked"
          ? "浏览器拦截了 HTTPS 页面对 http:// 局域网地址的请求（混合内容），见下方处理方式"
          : describeError(err);
      return false;
    } finally {
      checking.value = false;
      lastCheckedAt.value = Date.now();
    }
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(intervalMs = 5000) {
    if (pollTimer !== null) return;
    void checkHealth();
    for (const channel of noticeChannels) channel.start();
    pollTimer = setInterval(() => void checkHealth(), intervalMs);
    // 页面同源若就是微后端（同一反向代理托管），记为默认地址；用户从未手动设过
    // 地址时直接切过去（探测期间用户已手动改过则不覆盖）。
    if (!DEV_PROXY_ACTIVE) {
      void detectSameOriginBackend().then((hit) => {
        if (!hit) return;
        sameOriginBackend.value = true;
        if (!storedUrl && !legacyUrl && baseUrl.value === initialUrl) setBaseUrl(PAGE_ORIGIN);
      });
    }
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    for (const channel of noticeChannels) channel.stop();
  }

  watch(baseUrl, () => {
    health.value = null;
    online.value = false;
    registrySupport.value = "unknown";
    if (pollTimer === null) return;
    for (const channel of noticeChannels) {
      channel.stop();
      channel.start();
      channel.signal();
    }
    void checkHealth();
  });

  return {
    baseUrl,
    defaultUrl,
    recentUrls,
    sameOrigin,
    devProxyActive,
    online,
    health,
    schedulerLocal,
    executionReady,
    registrySupport,
    roleLabel,
    lastError,
    checking,
    lastCheckedAt,
    workflowNoticeRevision,
    workflowNoticeState,
    materialsNoticeRevision,
    materialsNoticeState,
    api,
    setBaseUrl,
    checkHealth,
    startPolling,
    stopPolling,
    /** 兼容旧页面命名：与 `online` 同义。 */
    schedulerOnline: online,
  };
});
