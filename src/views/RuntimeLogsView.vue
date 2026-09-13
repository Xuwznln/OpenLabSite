<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
import { NAlert, NButton, NCheckbox, NEmpty, NInput, NSelect, NTag, useMessage } from "naive-ui";
import { ApiError, type RuntimeLogNotice, type RuntimeLogSource } from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import { describeError } from "../features/errors";
import { createRefreshQueue } from "../features/refresh-queue";
import { createLogReadGuard, emptyLogWindow, filterLogLines, LOG_LEVELS, logLevel, mergeLogBatch, type LogLevelFilter } from "../features/runtime-logs";
import { useConnectionStore } from "../stores/connection";
import { palette } from "../theme";

const route = useRoute();
const conn = useConnectionStore();
const message = useMessage();
const sources = shallowRef<RuntimeLogSource[]>([]);
const selected = ref(typeof route.query.source === "string" ? route.query.source : "");
const windowState = shallowRef(emptyLogWindow());
const path = ref("");
const pid = ref<number | null>(null);
const paused = ref(false);
const follow = ref(true);
const minimum = ref<LogLevelFilter>("INFO");
const keyword = ref("");
const error = ref("");
const loading = ref(false);
const lastUpdated = ref(0);
const restarted = ref(false);
const viewport = ref<HTMLElement | null>(null);
const guard = createLogReadGuard();
const current = computed(() => sources.value.find((source) => source.source_id === selected.value));
const readStatus = computed(() => {
  const waiting = !conn.online ? "后端离线"
    : !conn.executionReady ? "等待 Host"
    : paused.value ? "已暂停"
    : !current.value ? "等待日志来源"
    : !current.value.supported ? "日志未就绪"
    : !current.value.online && !current.value.managed ? "Slave 离线"
    : error.value ? "等待重试" : "";
  const status = waiting || (conn.logsNoticeState === "live" ? "SSE 实时通知" : "通知连接中");
  return { text: status, type: waiting || conn.logsNoticeState !== "live" ? "warning" as const : "success" as const };
});
const lines = computed(() => filterLogLines(windowState.value.lines, minimum.value, keyword.value));
const levelOptions = LOG_LEVELS.map((value) => ({ value, label: value === "ALL" ? "全部级别" : `${value} 及以上` }));
const sourceOptions = computed(() => sources.value.map((source) => ({ value: source.source_id, label: `${source.role === "host" ? "Host" : "Slave"} · ${source.name}` })));
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let needsSources = true;
let needsRead = true;
let forceOnce = false;
let retryMs = 1000;
let releaseNotices: (() => void) | null = null;

function clearWindow() {
  guard.invalidate();
  windowState.value = emptyLogWindow();
  path.value = "";
  pid.value = null;
  error.value = "";
  restarted.value = false;
  lastUpdated.value = 0;
  needsRead = true;
}

async function fetchSnapshot() {
  const forced = forceOnce;
  forceOnce = false;
  if (stopped || !conn.online || !conn.executionReady || (!forced && (paused.value || document.hidden))) return;
  if (!needsSources && !needsRead && !forced) return;
  const api = conn.api.domains;
  const base = conn.baseUrl;
  let ticket = guard.capture();
  const valid = () => !stopped && base === conn.baseUrl && guard.accepts(ticket);
  loading.value = true;
  try {
    if (needsSources || forced) {
      needsSources = false;
      const listed = (await api.system.logSources()).sources;
      if (!valid()) return;
      sources.value = listed;
      if (!selected.value) {
        const device = typeof route.query.device === "string" ? route.query.device : "";
        selected.value = device
          ? listed.find((source) => source.device_ids.includes(device))?.source_id ?? ""
          : listed[0]?.source_id ?? "";
        ticket = guard.capture();
      }
    }
    const source = current.value;
    if (!source) {
      error.value = selected.value ? "此日志来源已移除，请选择其它进程" : "尚未找到对应设备的日志来源";
      return;
    }
    if (!source.supported || (!source.online && !source.managed)) {
      error.value = source.supported ? "Slave 已离线；保留最后读取的日志，恢复连接后继续" : source.detail;
      return;
    }
    const target = selected.value;
    needsRead = false;
    const batch = await api.system.logs(target, { cursor: windowState.value.cursor, limit: 500 });
    if (!valid() || target !== selected.value) return;
    windowState.value = mergeLogBatch(windowState.value, batch);
    restarted.value ||= batch.reset;
    path.value = batch.path;
    pid.value = batch.pid;
    needsRead ||= batch.has_more;
    retryMs = 1000;
    error.value = "";
    lastUpdated.value = Date.now();
    await nextTick();
    if (follow.value && viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight;
    // 仅响应在途新通知或追赶尚未读完的内容；读到尾部后不再定时发请求。
    if (needsRead || needsSources) scheduleRead(200);
  } catch (failure) {
    if (!valid()) return;
    needsRead = true;
    needsSources = true;
    const mismatch = failure instanceof ApiError && failure.status === 404;
    error.value = mismatch ? "日志接口或来源不存在，请检查运行中的前后端是否与当前协议一致；不会回退旧接口。" : describeError(failure);
    if (!mismatch) { scheduleRead(retryMs); retryMs = Math.min(retryMs * 2, 10000); }
  } finally {
    loading.value = false;
  }
}

const refresh = createRefreshQueue(fetchSnapshot);
function scheduleRead(delay: number) {
  if (stopped || timer) return;
  timer = setTimeout(() => { timer = null; void refresh(); }, delay);
}
function manualRefresh() { forceOnce = true; needsSources = true; needsRead = true; void refresh(); }
function onNotice(notice: RuntimeLogNotice) {
  needsSources ||= notice.sources_changed;
  needsRead ||= notice.all_sources || !selected.value || notice.source_ids.includes(selected.value)
    || !!current.value?.node_id && notice.source_ids.includes(`slave:${current.value.node_id}`);
  if (needsSources || needsRead) void refresh();
}
function visibleAgain() { if (!document.hidden && !paused.value) { needsRead = true; needsSources = true; void refresh(); } }
function handleScroll() {
  const el = viewport.value;
  if (el) follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 45;
}
function download() {
  const blob = new Blob([lines.value.map((line) => line.text).join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(current.value?.name ?? "runtime").replace(/[^\p{L}\p{N}_.-]/gu, "_")}.log`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy() {
  try { await navigator.clipboard.writeText(lines.value.map((line) => line.text).join("\n")); message.success("已复制当前筛选日志"); }
  catch { message.warning("浏览器不允许复制，请使用下载"); }
}

watch(selected, () => { clearWindow(); void refresh(); }, { flush: "sync" });
watch(() => conn.baseUrl, () => {
  clearWindow(); sources.value = []; selected.value = ""; needsSources = true;
  void refresh();
}, { flush: "sync" });
watch(() => [conn.online, conn.executionReady], () => { guard.invalidate(); needsSources = true; needsRead = true; void refresh(); });
watch(paused, () => { guard.invalidate(); needsRead = true; if (!paused.value) void refresh(); });
watch(() => route.query.source, (value) => { if (typeof value === "string") selected.value = value; });
watch(() => route.query.device, () => { selected.value = ""; needsSources = true; void refresh(); });
watch([minimum, keyword, follow], async () => {
  await nextTick();
  if (follow.value && viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight;
});
onMounted(() => { releaseNotices = conn.onLogNotice(onNotice); document.addEventListener("visibilitychange", visibleAgain); void refresh(); });
onUnmounted(() => { stopped = true; guard.invalidate(); releaseNotices?.(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visibleAgain); });
</script>

<template>
  <div class="logs-page" :style="{ '--log-error': palette.error, '--log-warning': palette.warning }">
    <PageHeader title="实时日志" overline="Runtime Logs" subtitle="Host 与 Slave 分进程查看 · 有界增量读取 · 不影响设备执行">
      <template #actions>
        <NButton :disabled="!conn.online || !conn.executionReady" @click="paused = !paused">{{ paused ? "继续实时读取" : "暂停读取" }}</NButton>
        <NButton :loading="loading" :disabled="!conn.online || !conn.executionReady" @click="manualRefresh">刷新</NButton>
      </template>
    </PageHeader>
    <div v-if="!conn.online" class="degraded"><span class="degraded-title">后端离线</span>保留最后读取的日志，恢复连接后继续；切换地址会清空窗口。</div>
    <div v-else-if="!conn.executionReady" class="degraded"><span class="degraded-title">Host 执行面未就绪</span>纯调度进程没有 Host / Slave 日志；分离部署中请等待 Host 接入。</div>
    <div class="log-layout">
      <aside class="source-list">
        <div class="section-title">进程来源 <span>{{ sources.length }}</span></div>
        <NEmpty v-if="!sources.length" size="small" :description="loading ? '正在读取进程列表' : '暂无日志来源'" />
        <button v-for="source in sources" :key="source.source_id" class="source" :class="{ selected: selected === source.source_id }" @click="selected = source.source_id">
          <span class="source-title"><NTag size="small" :bordered="false">{{ source.role === 'host' ? 'Host' : 'Slave' }}</NTag><b>{{ source.name }}</b></span>
          <span class="source-state">{{ source.online ? '在线' : '未连接' }} · {{ source.managed ? '本机受管' : source.role === 'host' ? '本机' : 'HostLink 接入' }}</span>
          <span class="machine">{{ source.machine_name }}</span>
          <span class="source-state">{{ source.device_ids.length }} 个设备 · PID {{ source.source_id === selected && pid ? pid : source.pid ?? '—' }}</span>
        </button>
      </aside>
      <section class="log-panel">
        <NSelect v-model:value="selected" class="mobile-source" :options="sourceOptions" placeholder="选择日志来源" />
        <div class="log-heading"><h2>{{ current?.name ?? '选择一个日志来源' }}</h2><NTag size="small" :type="readStatus.type" :bordered="false">{{ readStatus.text }}</NTag></div>
        <div class="source-state">{{ current?.detail }}<span v-if="current?.device_ids.length"> · 设备：{{ current.device_ids.join('、') }}</span></div>
        <div v-if="path" class="log-path" :title="path">{{ path }}</div>
        <div class="log-tools">
          <NSelect v-model:value="minimum" :options="levelOptions" style="width: 160px" aria-label="日志级别" />
          <NInput v-model:value="keyword" clearable placeholder="搜索日志 / 设备 / job ID" :input-props="{ 'aria-label': '搜索日志' }" class="keyword" />
          <NCheckbox v-model:checked="follow">跟随最新</NCheckbox>
          <NButton size="small" :disabled="!lines.length" @click="copy">复制</NButton>
          <NButton size="small" :disabled="!lines.length" @click="download">下载</NButton>
        </div>
        <NAlert v-if="error" type="warning" :bordered="false">{{ error }}</NAlert>
        <div v-if="restarted" class="source-state">日志文件已切换或截断，已从新日志尾部继续读取。</div>
        <div ref="viewport" class="log-viewport" tabindex="0" aria-label="进程日志内容" @scroll="handleScroll">
          <NEmpty v-if="!lines.length" size="small" :description="windowState.lines.length ? '当前筛选没有匹配日志' : loading ? '读取中' : '暂无完整日志行'" />
          <pre v-for="line in lines" :key="`${windowState.streamId}:${line.offset}`" class="log-line" :data-level="logLevel(line.text)">{{ line.text || ' ' }}</pre>
        </div>
        <div class="log-footer"><span>{{ lines.length }} / {{ windowState.lines.length }} 行<span v-if="windowState.trimmed"> · 仅保留有界尾部窗口，完整日志仍在进程所在机器</span></span><span>{{ lastUpdated ? `更新于 ${new Date(lastUpdated).toLocaleTimeString()}` : '尚未读取' }}</span></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.logs-page { display: flex; flex-direction: column; gap: 12px; }
.log-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 14px; }
.source-list, .log-panel { background: var(--panel); border: 1px solid var(--hairline); border-radius: 12px; padding: 14px; min-width: 0; }
.source-list { display: flex; flex-direction: column; gap: 8px; align-self: start; max-height: 72vh; overflow: auto; }
.section-title { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 6px; }
.source { text-align: left; border: 1px solid var(--hairline); border-radius: 8px; padding: 10px; background: var(--panel-soft); cursor: pointer; display: flex; flex-direction: column; gap: 5px; }
.source.selected { border-color: var(--domain-accent); background: var(--domain-accent-soft); }
.source-title { display: flex; align-items: center; gap: 7px; overflow-wrap: anywhere; }
.source-state, .machine, .log-path, .log-footer { opacity: .7; font-size: 12px; overflow-wrap: anywhere; }
.machine, .log-path { font-family: var(--font-mono); }
.log-panel { display: flex; flex-direction: column; gap: 10px; }
.log-heading, .log-tools, .log-footer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.log-heading { justify-content: space-between; }
h2 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
.log-path { max-height: 42px; overflow: hidden; }
.keyword { flex: 1; min-width: 160px; }
.log-viewport { height: 58vh; min-height: 260px; overflow: auto; background: var(--paper); border: 1px solid var(--hairline); border-radius: 8px; padding: 12px; }
.log-line { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.7 var(--font-mono); }
.log-line[data-level="ERROR"], .log-line[data-level="CRITICAL"] { color: var(--log-error); }
.log-line[data-level="WARNING"] { color: var(--log-warning); }
.log-footer { justify-content: space-between; }
.mobile-source { display: none; }
@media (max-width: 950px) { .log-layout { grid-template-columns: minmax(0, 1fr); } .source-list { display: none; } .mobile-source { display: block; } }
</style>
