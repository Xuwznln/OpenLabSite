/** 同一个 SSE URL 只持有一条连接；转发失效事件及其索引，业务正文仍经 HTTP 读取。 */
export class NoticeHub {
  private streams = new Map<string, { source: EventSource; listeners: Map<object, (type: string, data?: string) => void>; types: Set<string> }>();

  constructor(private create: (url: string) => EventSource) {}

  subscribe(url: string, key: object, types: string[], send: (type: string, data?: string) => void): () => void {
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
          if (event instanceof MessageEvent) listener(type, String(event.data));
          else listener(type);
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
