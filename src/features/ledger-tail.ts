/**
 * 读物料账本最近的若干条。
 *
 * `/inventory/ledger` 只能按 sequence 正序翻页（`after_id`）：`ledger(0, N)` 拿到的是**最早**的 N 条，账本一旦
 * 超过 N 条，新变更就再也不出现在「实时」列表里。这里先读末尾序号（`inventory.health().ledger_sequence`），
 * 再从 `末尾 - N` 之后读。两次请求之间新写入的几条留给下一轮刷新。
 */
import type { InventoryApi, MaterialsV1Change } from "@openlab/protocol";

export type LedgerTailApi = Pick<InventoryApi, "health" | "ledger">;

/** 读最近 `limit` 条之前的游标：末尾不足 `limit` 条时从头读。 */
export function ledgerTailStart(latestSequence: number, limit: number): number {
  return Math.max(0, Math.floor(latestSequence) - limit);
}

/** 最近 `limit` 条账本（按 sequence 正序）。 */
export async function recentLedger(api: LedgerTailApi, limit: number): Promise<MaterialsV1Change[]> {
  const { ledger_sequence } = await api.health();
  return api.ledger(ledgerTailStart(ledger_sequence, limit), limit);
}
