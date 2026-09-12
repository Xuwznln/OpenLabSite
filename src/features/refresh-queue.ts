/** 同时只取一次快照；取数期间到达的失效通知合并为下一轮，不能直接丢弃。 */
export function createRefreshQueue(fetchSnapshot: () => Promise<void>): () => Promise<void> {
  let pending = false;
  let running: Promise<void> | null = null;
  return () => {
    pending = true;
    if (!running) {
      running = Promise.resolve().then(async () => {
        try {
          do {
            pending = false;
            await fetchSnapshot();
          } while (pending);
        } finally {
          running = null;
        }
      });
    }
    return running;
  };
}
