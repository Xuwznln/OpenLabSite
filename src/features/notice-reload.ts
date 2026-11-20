/**
 * 打开期间随失效通知重读的列表（如「插入已发布的工作流」里的发布 / 实验操作列表）：
 * `revision`（`conn.workflowNoticeRevision`：`workflow.authoring.changed`、`workflow.runtime.changed`、
 * `stream.reset` 与重连校准）变化且列表正打开时调 `reload`。关着的不重读，打开时由调用方读一次。
 */
import { watch, type WatchSource } from "vue";

export function reloadOnNotice(revision: WatchSource<number>, active: () => boolean, reload: () => void) {
  return watch(revision, () => {
    if (active()) reload();
  });
}
