/**
 * 物料流（`/api/v1/materials/events`）的浏览器失效通知：`materials.changed` 只让物料相关页面重读；
 * 后端换了一份数据时整体重读。本模块不解析事件 data，只看事件名与 SSE id。
 *
 * 「后端换了一份数据」有两种信号：
 * - `stream.reset`：重连时游标来自另一个库（`epoch_changed`）或超前于账本（`cursor_ahead`）；
 * - id 里的账本纪元变了：SSE id 是 `<sequence>:<epoch>`，同一个库的纪元不变。新建的连接（例如页面从
 *   往返缓存恢复）不带旧游标，服务端无从比较，只能由页面比对前后两次看到的纪元。
 * 没有纪元的 id（账本为空时的 `<sequence>`、旧后端的纯数字 id）不改变判断。
 */
import { MATERIALS_CHANGED_EVENT, MATERIALS_EVENT_NAMES, STREAM_RESET_EVENT, materialsEventEpoch } from "@openlab/protocol";

export const MATERIALS_INVALIDATION_EVENT_TYPES = MATERIALS_EVENT_NAMES;

export interface LedgerEpochTracker {
  /** 记录一条 `materials.changed` 的 id；纪元与上次记下的不同时返回 true（第一次记录不算变化）。 */
  observe(lastEventId: string | null | undefined): boolean;
  /** `stream.reset` 已经触发整体重读：直接采用重置帧 id 里的纪元（空账本没有纪元则清空），不再重复触发。 */
  adopt(lastEventId: string | null | undefined): void;
  /** 换了后端地址：忘掉记下的纪元。 */
  clear(): void;
}

export function createLedgerEpochTracker(): LedgerEpochTracker {
  let known: string | null = null;
  return {
    observe(lastEventId) {
      const epoch = materialsEventEpoch(lastEventId);
      if (epoch === null) return false;
      const changed = known !== null && known !== epoch;
      known = epoch;
      return changed;
    },
    adopt(lastEventId) {
      known = materialsEventEpoch(lastEventId);
    },
    clear() {
      known = null;
    },
  };
}

export interface MaterialsInvalidationSource {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

function lastEventIdOf(event: Event): string {
  return "lastEventId" in event && typeof event.lastEventId === "string" ? event.lastEventId : "";
}

/**
 * 绑定物料流：`materials.changed` → `invalidate`（物料页面重读）；`stream.reset` 或纪元变化 → `resync`
 * （全部页面重读一次，由调用方去抖合并）。
 */
export function bindMaterialsInvalidations(
  source: MaterialsInvalidationSource,
  invalidate: () => void,
  epochs: LedgerEpochTracker,
  resync: () => void,
): () => void {
  const changed: EventListener = (event) => {
    invalidate();
    if (epochs.observe(lastEventIdOf(event))) resync();
  };
  const reset: EventListener = (event) => {
    epochs.adopt(lastEventIdOf(event));
    resync();
  };
  source.addEventListener(MATERIALS_CHANGED_EVENT, changed);
  source.addEventListener(STREAM_RESET_EVENT, reset);
  return () => {
    source.removeEventListener(MATERIALS_CHANGED_EVENT, changed);
    source.removeEventListener(STREAM_RESET_EVENT, reset);
  };
}
