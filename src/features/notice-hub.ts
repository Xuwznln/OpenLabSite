/** 失效事件的转发回调：事件名、data 原文，以及服务端写了 SSE id 时的 `lastEventId`。 */
export type NoticeSend = (type: string, data?: string, lastEventId?: string) => void;

/** 同一个 SSE URL 只持有一条连接；转发失效事件及其索引，业务正文仍经 HTTP 读取。 */
export class NoticeHub {
  private streams = new Map<string, { source: EventSource; listeners: Map<object, NoticeSend>; types: Set<string> }>();

  constructor(private create: (url: string) => EventSource) {}

  subscribe(url: string, key: object, types: string[], send: NoticeSend): () => void {
    let stream = this.streams.get(url);
    if (!stream) {
      stream = { source: this.create(url), listeners: new Map(), types: new Set() };
      this.streams.set(url, stream);
    }
    const current = stream;
    current.listeners.set(key, send);
    for (const type of ["open", "error", ...types]) {
      if (current.types.has(type)) continue;
      current.types.add(type);
      current.source.addEventListener(type, (event) => {
        for (const listener of current.listeners.values()) {
          if (!(event instanceof MessageEvent)) listener(type);
          // 物料流的 id 带账本纪元，页面据此判断后端是否换了库；没有 id 的事件不多传参数。
          else if (event.lastEventId) listener(type, String(event.data), event.lastEventId);
          else listener(type, String(event.data));
        }
      });
    }
    if (current.source.readyState === 1) send("open");
    return () => {
      current.listeners.delete(key);
      if (!current.listeners.size) {
        current.source.close();
        this.streams.delete(url);
      }
    };
  }
}
