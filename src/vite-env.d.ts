/// <reference types="vite/client" />

/** Vite dev server 的 /api 代理目标（vite.config.ts 的 define 注入；生产构建为空串）。 */
declare const __OPENLAB_DEV_PROXY_TARGET__: string;

interface ImportMetaEnv {
  /** 首次连接的默认微后端地址。 */
  readonly VITE_DEFAULT_EDGE_URL?: string;
  /** 驱动包索引地址（缺省 awesome-lab-devices 的 main/index.json）。 */
  readonly VITE_OPENLAB_DEVICE_INDEX_URL?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
