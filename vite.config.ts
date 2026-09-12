import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

// 相对 base + hash 路由：产物可部署在 GitHub Pages 任意子路径（如 /OpenLab/）
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, ".", "");
  // 默认不转发：页面直连微后端（CORS 已放开，本机 :8002 或任意可达地址）。
  // 只有微后端不可直达（远程机器经本机隧道 / HTTPS 混合内容）时，才在 .env 里
  // 设 OPENLAB_EDGE_PROXY_TARGET 让 dev server 代理 /api。
  const edgeProxyTarget = env.OPENLAB_EDGE_PROXY_TARGET?.trim() || "";

  return {
    base: "./",
    plugins: [vue()],
    define: {
      // 连接面板据此说明"开发代理把 /api 转到了哪里"；未配置或生产构建为空串。
      __OPENLAB_DEV_PROXY_TARGET__: JSON.stringify(command === "serve" ? edgeProxyTarget : ""),
    },
    server: {
      host: "0.0.0.0",
      port: 5180,
      // 本地联调会经端口转发/临时域名访问；仅影响 dev server。
      allowedHosts: true,
      proxy: edgeProxyTarget
        ? {
            // REST 与 SSE 都在 /api/v1 下；同源代理避免 CORS 与 HTTPS 混合内容。
            "/api": {
              target: edgeProxyTarget,
              changeOrigin: true,
              ws: true,
            },
          }
        : undefined,
    },
  };
});
