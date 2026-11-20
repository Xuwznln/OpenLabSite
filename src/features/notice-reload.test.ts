import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { reloadOnNotice } from "./notice-reload";

describe("打开的列表随工作流失效通知重读", () => {
  it("revision 变化时只有打开着才重读；停止监听后不再触发", async () => {
    const revision = ref(0);
    const open = ref(false);
    const reload = vi.fn();
    const stop = reloadOnNotice(() => revision.value, () => open.value, reload);

    revision.value += 1;
    await nextTick();
    expect(reload).not.toHaveBeenCalled();

    open.value = true;
    revision.value += 1;
    await nextTick();
    expect(reload).toHaveBeenCalledTimes(1);

    stop();
    revision.value += 1;
    await nextTick();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
