/** 多标签页共享通知连接，保留原有 SSE 协议与 HTTP 重取逻辑。 */
export interface NoticeSource extends EventTarget {
  onopen: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  close(): void;
}

export function openNoticeSource(url: string, types: string[]): NoticeSource {
  if (typeof SharedWorker === "undefined") return new EventSource(url);
  let worker: SharedWorker;
  try {
    worker = new SharedWorker(new URL("./notice.worker.ts", import.meta.url), { type: "module", name: "openlab-notices" });
  } catch {
    return new EventSource(url);
  }
  let closed = false;
  const source: NoticeSource = Object.assign(new EventTarget(), {
    onopen: null as ((event: Event) => unknown) | null,
    onerror: null as ((event: Event) => unknown) | null,
    close() {
      if (closed) return;
      closed = true;
      worker.port.postMessage({ action: "close" });
      worker.port.close();
      window.removeEventListener("pagehide", source.close);
    },
  });
  worker.port.onmessage = ({ data: { type, payload } }) => {
    if (type === "open") source.onopen?.(new Event("open"));
    else if (type === "error") source.onerror?.(new Event("error"));
    else source.dispatchEvent(new MessageEvent(type, { data: payload }));
  };
  worker.onerror = () => source.onerror?.(new Event("error"));
  worker.port.start();
  worker.port.postMessage({ action: "subscribe", url, types });
  window.addEventListener("pagehide", source.close);
  return source;
}
