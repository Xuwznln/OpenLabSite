/** Site 权威目录：通知只使缓存失效，实际内容经 HTTP 获取；多卡片共享一次请求。 */
import { defineStore } from "pinia";
import { ref, shallowRef, watch } from "vue";
import { SiteIndex } from "../features/site-bindings";
import { useConnectionStore } from "./connection";

export const useSiteBindingsStore = defineStore("site-bindings", () => {
  const conn = useConnectionStore();
  const index = shallowRef<SiteIndex | null>(null);
  const error = ref("");
  const loading = ref(false);
  let generation = 0;
  let pending: Promise<void> | null = null;

  function invalidate() {
    generation++;
    index.value = null;
    pending = null;
    loading.value = false;
  }
  function refresh(): Promise<void> {
    if (pending) return pending;
    const current = generation;
    index.value = null;
    error.value = "";
    loading.value = true;
    pending = (async () => {
      try {
        const items = await conn.api.domains.materialsV1.instances();
        if (current === generation) index.value = new SiteIndex(items);
      } catch {
        if (current === generation) error.value = "Site 目录获取失败，参数待校验；请重试";
      } finally {
        if (current === generation) { loading.value = false; pending = null; }
      }
    })();
    return pending;
  }
  async function ensure() { if (!index.value) await refresh(); }
  watch(() => [conn.baseUrl, conn.online, conn.materialsNoticeRevision], () => {
    invalidate();
    if (conn.online) void refresh();
  });
  return { index, error, loading, refresh, ensure };
});
