import { NoticeHub } from "./notice-hub";

const hub = new NoticeHub((url) => new EventSource(url));
// 使用结构类型，避免 DOM 与 WebWorker 全局声明冲突。
const scope = globalThis as unknown as { onconnect: (event: { ports: MessagePort[] }) => void };
scope.onconnect = ({ ports }) => {
  const port = ports[0];
  let release: (() => void) | undefined;
  port.onmessage = ({ data }) => {
    release?.();
    release = undefined;
    if (data.action === "close") {
      port.close();
      return;
    }
    if (data.action === "subscribe") {
      release = hub.subscribe(data.url, port, data.types, (type, payload) => port.postMessage({ type, payload }));
    }
  };
  port.start();
};
