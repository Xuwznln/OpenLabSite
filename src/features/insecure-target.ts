/**
 * HTTPS 页面（GitHub Pages 等）直连 `http://` 微后端会被浏览器当作混合内容拦截，
 * 请求根本发不出去，只会得到一个笼统的 "Network Error"。
 *
 * 浏览器把环回地址（127.0.0.1 / localhost / ::1）视为可信来源：Chrome、Edge、Firefox
 * 允许 HTTPS 页面直连 `http://127.0.0.1`，Safari 不允许。局域网地址（192.168.x.x 等）
 * 一律拦截。这里只做判定，文案放在连接面板里。
 */

export type TargetVerdict =
  /** 页面不是 HTTPS，或目标本身就是 HTTPS：浏览器不会因协议拦截。 */
  | "ok"
  /** HTTPS 页面连 http:// 环回地址：主流浏览器放行，Safari 除外。 */
  | "loopback"
  /** HTTPS 页面连 http:// 非环回地址：默认被拦截，需要用户在浏览器里放行。 */
  | "blocked";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.startsWith("127.") || host.endsWith(".localhost");
}

export function classifyTarget(baseUrl: string, pageProtocol: string = window.location.protocol): TargetVerdict {
  if (pageProtocol !== "https:") return "ok";
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "ok";
  }
  if (url.protocol !== "http:") return "ok";
  return isLoopbackHost(url.hostname) ? "loopback" : "blocked";
}

/** 生成一条把局域网端口映射到本机 127.0.0.1 的 Windows 命令，供用户复制。 */
export function portProxyCommand(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const port = url.port || "80";
    return `netsh interface portproxy add v4tov4 listenport=${port} listenaddress=127.0.0.1 connectport=${port} connectaddress=${url.hostname}`;
  } catch {
    return "";
  }
}
