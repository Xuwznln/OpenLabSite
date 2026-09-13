<script setup lang="ts">
/**
 * 连接状态 + 后端地址设置。
 *
 * 地址 = `unilab` 进程管理端口（`--port`，默认 8002），默认直连本机。只有要连别的
 * 进程（另一台 Host、`--role backend` 调度权威）或显式启用了 Vite 代理 / 反向代理
 * （此时地址就是页面同源）时才需要改。
 */
import { computed, ref, watch } from "vue";
import { NButton, NIcon, NInput, NPopover, useMessage } from "naive-ui";
import { SettingsOutline } from "@vicons/ionicons5";
import StatusPill from "./StatusPill.vue";
import { DEFAULT_LOCAL_EDGE_URL, DEV_PROXY_TARGET, normalizeBaseUrl, useConnectionStore } from "../stores/connection";
import { classifyTarget, portProxyCommand } from "../features/insecure-target";

const conn = useConnectionStore();
const message = useMessage();
const draft = ref(conn.baseUrl);
const show = ref(false);

watch(show, (open) => {
  if (open) draft.value = conn.baseUrl;
});

const stripScheme = (url: string) => url.replace(/^https?:\/\//, "");
const hostPort = computed(() => stripScheme(conn.baseUrl));
const isDefault = computed(() => conn.baseUrl === conn.defaultUrl);

/**
 * HTTPS 页面（GitHub Pages）直连 http:// 后端时的浏览器拦截提示。
 * 对输入框里的草稿判定，用户还没点「连接」就能看到怎么处理。
 */
const target = computed(() => normalizeBaseUrl(draft.value) || DEFAULT_LOCAL_EDGE_URL);
const verdict = computed(() => classifyTarget(target.value));
const proxyCommand = computed(() => portProxyCommand(target.value));
const targetPort = computed(() => {
  try {
    return new URL(target.value).port || "80";
  } catch {
    return "8002";
  }
});
const pageHost = window.location.host;

async function copyProxyCommand() {
  try {
    await navigator.clipboard.writeText(proxyCommand.value);
    message.success("已复制，请在管理员 PowerShell 中执行");
  } catch {
    message.error("复制失败，请手动选中命令复制");
  }
}

/** 当前地址是怎么来的：一句话说清，避免用户在 5180 / 8002 之间困惑。 */
const originNote = computed(() => {
  if (conn.devProxyActive) {
    return `已启用开发代理：本页面（${hostPort.value}）把 /api 转发到 ${DEV_PROXY_TARGET}（.env 的 OPENLAB_EDGE_PROXY_TARGET）。仅远程 / HTTPS 场景需要；本机直连请删掉该配置。`;
  }
  if (conn.sameOrigin) return "接口与本页面同源（由同一服务或反向代理提供），无需另填地址。";
  return "";
});

async function apply(url = draft.value) {
  conn.setBaseUrl(url);
  draft.value = conn.baseUrl;
  const ok = await conn.checkHealth();
  if (ok) {
    message.success(`已连接 ${conn.baseUrl} · ${conn.roleLabel}`);
    show.value = false;
  } else {
    message.error(`连接失败：${conn.lastError || "无法访问"}`);
  }
}
</script>

<template>
  <div class="conn-bar">
    <StatusPill
      :status="conn.online ? 'online' : 'offline'"
      :label="conn.online ? conn.roleLabel : '未连接'"
    />
    <NPopover v-model:show="show" trigger="click" placement="bottom-end" :width="380">
      <template #trigger>
        <NButton quaternary circle size="small" title="连接设置">
          <template #icon>
            <NIcon><SettingsOutline /></NIcon>
          </template>
        </NButton>
      </template>
      <div class="pop">
        <div class="pop-head">
          <span class="pop-title">后端地址</span>
          <span v-if="conn.online" class="pop-role">
            <span class="dot" />{{ conn.roleLabel }}
          </span>
        </div>

        <div class="pop-row">
          <NInput
            v-model:value="draft"
            :placeholder="DEFAULT_LOCAL_EDGE_URL"
            size="small"
            class="mono"
            @keyup.enter="apply()"
          />
          <NButton size="small" type="primary" :loading="conn.checking" @click="apply()">连接</NButton>
        </div>

        <p class="pop-hint">
          就是 <code>unilab</code> 进程的管理端口：启动参数 <code>--port</code>，默认
          <code>8002</code>。要连别的进程（另一台 Host、或 <code>unilab --role backend</code>
          调度权威），把地址改成它的 <code>host:port</code> 即可。
        </p>
        <p v-if="originNote" class="pop-hint pop-origin">{{ originNote }}</p>
        <p v-else-if="conn.lastError && !conn.online" class="pop-error">{{ conn.lastError }}</p>

        <div v-if="verdict === 'blocked'" class="pop-warn">
          <p class="pop-warn-title">本页面是 HTTPS，浏览器默认会拦截对 <code>http://</code> 局域网地址的请求</p>
          <p>
            这是浏览器的混合内容（Mixed Content）限制，不是进程没启动。三种处理方式任选其一：
          </p>
          <ol>
            <li>
              <strong>放行本站（推荐，只需一次）</strong>：点击地址栏左侧的图标 → 网站设置 →
              把「不安全内容」改为「允许」，然后刷新页面。Chrome / Edge 均支持。
            </li>
            <li>
              <strong>进程就在本机</strong>：直接填 <code>{{ DEFAULT_LOCAL_EDGE_URL }}</code>。
              Chrome / Edge / Firefox 允许 HTTPS 页面直连本机 <code>127.0.0.1</code>（Safari 不允许）。
            </li>
            <li>
              <strong>进程在另一台机器，但你用 Windows</strong>：以管理员身份运行下面这条命令，把该端口映射到本机，然后填
              <code>http://127.0.0.1:{{ targetPort }}</code>：
              <div class="pop-cmd">
                <code>{{ proxyCommand }}</code>
                <button type="button" class="link-btn" @click="copyProxyCommand">复制</button>
              </div>
            </li>
          </ol>
          <p class="pop-warn-foot">
            或者用 <code>http://</code> 打开本站，也可以让运维把 <code>/api</code> 反代到 <code>{{ pageHost }}</code> 同源。
          </p>
        </div>
        <p v-else-if="verdict === 'loopback'" class="pop-hint pop-origin">
          本页面是 HTTPS：Chrome / Edge / Firefox 允许直连本机 <code>http://127.0.0.1</code>；
          Safari 会拦截，请改用其他浏览器或用 <code>http://</code> 打开本站。
        </p>

        <a class="link-btn" href="https://github.com/Xuwznln/OpenLabSite/blob/main/docs/LOCAL_START.md" target="_blank" rel="noopener noreferrer">首次使用？查看本地启动教程</a>
        <div class="pop-foot">
          <span v-if="conn.online && conn.health" class="health mono">
            scheduler {{ conn.health.scheduler }} · execution {{ conn.health.execution }} · registry
            {{ conn.registrySupport === "available" ? "yes" : conn.registrySupport === "unsupported" ? "no" : "…" }}
          </span>
          <span v-else class="health mono">未连接</span>
          <button v-if="!isDefault" type="button" class="link-btn" @click="apply(conn.defaultUrl)">
            恢复默认（{{ stripScheme(conn.defaultUrl) }}）
          </button>
        </div>
      </div>
    </NPopover>
  </div>
</template>

<style scoped>
.conn-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pop {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pop-title {
  font-size: 13px;
  font-weight: 700;
}

.pop-role {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #0b7a55;
  font-weight: 600;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #0b7a55;
}

.pop-row {
  display: flex;
  gap: 8px;
}

.pop-row .mono :deep(input) {
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.pop-hint {
  margin: 0;
  font-size: 12px;
  color: #5c6874;
  line-height: 1.55;
}

.pop-hint code {
  font-size: 11px;
  background: #f1f0eb;
  padding: 0 4px;
  border-radius: 4px;
}

.pop-origin {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--domain-accent-soft);
  color: #2f3a45;
}

.pop-error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}

.pop-warn {
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff7e6;
  border: 1px solid #f5d38a;
  font-size: 12px;
  line-height: 1.55;
  color: #4a3b1f;
}

.pop-warn p {
  margin: 0 0 6px;
}

.pop-warn-title {
  font-weight: 700;
  color: #8a5a00;
}

.pop-warn ol {
  margin: 0 0 6px;
  padding-left: 18px;
}

.pop-warn li + li {
  margin-top: 4px;
}

.pop-warn code {
  font-size: 11px;
  background: rgba(0, 0, 0, 0.06);
  padding: 0 4px;
  border-radius: 4px;
}

.pop-warn-foot {
  margin-bottom: 0 !important;
  color: #6e5a33;
}

.pop-cmd {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 4px;
}

.pop-cmd code {
  flex: 1;
  display: block;
  padding: 4px 6px;
  word-break: break-all;
  font-family: var(--font-mono);
}

.pop-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--hairline);
}

.health {
  font-size: 11px;
  color: #6e7580;
}

.mono {
  font-family: var(--font-mono);
}

.link-btn {
  border: 0;
  background: none;
  padding: 0;
  font: 600 12px var(--font-sans);
  color: var(--domain-accent);
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}
</style>
