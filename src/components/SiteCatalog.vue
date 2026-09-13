<script setup lang="ts">
/**
 * 站点目录：awesome-lab-sites 索引里列出的前端站点（浏览器直接读 index.json，与后端无关）。
 *
 * 本站固定通用；其他前端在新标签页打开，不切换本站主题。
 * 与「驱动包」页读 awesome-lab-devices 是同一套模式；后端导航页（unilab 管理端口的 /）也读同一份索引。
 */
import { computed, onMounted, ref, shallowRef } from "vue";
import { NButton, NPopover, NTag } from "naive-ui";
import { LAB_THEMES, isLabThemeId } from "../features/domain-themes";
import {
  DEFAULT_SITE_INDEX_URL,
  SITE_INDEX_REPO_URL,
  fetchSiteIndex,
  isSameDeployment,
  siteEntryHref,
  siteEntryTheme,
  siteIndexRepoUrl,
  type SiteIndex,
  type SiteIndexEntry,
} from "../features/site-index";
import { useDomainThemeStore } from "../stores/domain-theme";

const domain = useDomainThemeStore();

const open = ref(false);
const loading = ref(false);
const error = ref("");
const index = shallowRef<SiteIndex | null>(null);

const currentHref = computed(() => (typeof location === "undefined" ? "" : location.href));
const repoUrl = computed(() => siteIndexRepoUrl(DEFAULT_SITE_INDEX_URL));

async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    index.value = await fetchSiteIndex(DEFAULT_SITE_INDEX_URL);
  } catch (err) {
    index.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function entryTheme(entry: SiteIndexEntry): string {
  return entry.theme || siteEntryTheme(entry.url);
}

function themeLabel(entry: SiteIndexEntry): string {
  const theme = entryTheme(entry);
  return isLabThemeId(theme) ? LAB_THEMES[theme].shortName : theme;
}

function isHere(entry: SiteIndexEntry): boolean {
  if (!currentHref.value || !isSameDeployment(entry.url, currentHref.value)) return false;
  const theme = entryTheme(entry);
  return !theme || theme === domain.activeId;
}

function openEntry(entry: SiteIndexEntry) {
  window.open(siteEntryHref(entry.url, currentHref.value), "_blank", "noreferrer");
}

onMounted(() => void load());
</script>

<template>
  <NPopover trigger="click" placement="bottom-end" :show="open" @update:show="(v) => (open = v)">
    <template #trigger>
      <button type="button" class="site-trigger" title="站点目录：awesome-lab-sites 里的前端站点">
        站点
        <span v-if="index" class="site-count">{{ index.sites.length }}</span>
      </button>
    </template>
    <div class="site-catalog">
      <div class="catalog-head">
        <span class="catalog-title">前端站点</span>
        <span class="dim small">
          索引
          <a :href="repoUrl" target="_blank" rel="noreferrer" class="link">awesome-lab-sites</a>
          <template v-if="loading">· 读取中…</template>
          <template v-else-if="error">· <span class="err">不可达：{{ error }}</span></template>
          <template v-else-if="index">
            · {{ index.sites.length }} 个站点<template v-if="index.updatedAt">，更新于 {{ index.updatedAt }}</template>
          </template>
        </span>
      </div>

      <div v-if="!loading && !index" class="dim small empty-hint">
        <template v-if="error">索引读不到。站点列表随索引仓库维护，可稍后重试。</template>
        <template v-else>索引为空。给 <a :href="SITE_INDEX_REPO_URL" target="_blank" rel="noreferrer" class="link">awesome-lab-sites</a> 提 PR 收录你的站点。</template>
      </div>
      <ul v-else-if="index" class="sites">
        <li v-for="entry in index.sites" :key="entry.id" class="site" :class="{ here: isHere(entry) }">
          <button type="button" class="site-main" :title="entry.url" @click="openEntry(entry)">
            <span class="site-title">
              <span class="site-name">{{ entry.name }}</span>
              <NTag v-if="isHere(entry)" size="tiny" :bordered="false" type="info">当前</NTag>
              <NTag size="tiny" :bordered="false" :type="entry.official ? 'success' : 'default'">{{ entry.official ? "官方" : "社区" }}</NTag>
              <span v-if="themeLabel(entry)" class="mono dim small">{{ themeLabel(entry) }}</span>
            </span>
            <span v-if="entry.description" class="site-desc">{{ entry.description }}</span>
          </button>
          <a v-if="entry.homepage" :href="entry.homepage" target="_blank" rel="noreferrer" class="link small">主页</a>
        </li>
      </ul>

      <div class="catalog-foot">
        <span class="dim small">本站仅提供通用界面；其他前端在新标签页打开。</span>
        <NButton size="tiny" quaternary :loading="loading" @click="load">刷新</NButton>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.site-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  padding: 4px 10px;
  background: #f1f0eb;
  color: #5c6874;
  font: 600 12px var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
  transition: 150ms ease;
}

.site-trigger:hover {
  color: #101418;
  background: #fff;
}

.site-count {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 0 5px;
  border-radius: 999px;
  background: #fff;
  color: #3d4650;
}

.site-catalog {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 380px;
  max-width: calc(100vw - 32px);
}

.catalog-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.catalog-title {
  font-weight: 700;
  font-size: 13px;
  color: #101418;
}

.sites {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow: auto;
}

.site {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 0 10px 0 0;
}

.site.here {
  border-color: var(--domain-accent);
  background: var(--domain-accent-soft);
}

.site-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.site-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.site-name {
  font-weight: 600;
  font-size: 12.5px;
}

.site-desc {
  font-size: 11.5px;
  color: #3d4650;
}

.catalog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.empty-hint {
  padding: 8px 0;
}

.link {
  color: var(--domain-accent);
}

.err {
  color: #c0392b;
}

.mono {
  font-family: var(--font-mono);
}

.small {
  font-size: 11px;
}

.dim {
  color: #8b929c;
}
</style>
