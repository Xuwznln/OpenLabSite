import type { DeviceProcessesApi } from "@openlab/protocol";

/** 只清除确认时看到的受管进程；不删除业务数据，不吞掉部分失败。 */
export async function resetManagedProcesses(
  api: Pick<DeviceProcessesApi, "remove">,
  ids: readonly string[],
  status: () => Promise<{ active_jobs: unknown[]; pending: boolean; restarting: boolean }>,
) {
  const current = await status();
  if (current.active_jobs.length || current.pending || current.restarting) {
    throw new Error("请先结束活跃作业并等待重启完成，再清空受管设备进程");
  }
  const removed: string[] = [];
  const failed: { id: string; error: unknown }[] = [];
  for (const id of new Set(ids)) {
    try {
      await api.remove(id);
      removed.push(id);
    } catch (error) {
      failed.push({ id, error });
    }
  }
  return { removed, failed };
}
