import { describe, expect, it, vi } from "vitest";
import type { MaterialsV1Change } from "@openlab/protocol";
import { ledgerTailStart, recentLedger, type LedgerTailApi } from "./ledger-tail";

describe("最近的物料账本", () => {
  it("账本不足 limit 条时从头读，超过时从末尾往前数 limit 条", () => {
    expect(ledgerTailStart(0, 500)).toBe(0);
    expect(ledgerTailStart(120, 500)).toBe(0);
    expect(ledgerTailStart(500, 500)).toBe(0);
    expect(ledgerTailStart(1533, 500)).toBe(1033);
  });

  it("先读末尾序号，再按 after_id 读最近的 limit 条", async () => {
    const rows = [{ sequence: 1034 }, { sequence: 1533 }] as MaterialsV1Change[];
    const api = {
      health: vi.fn(async () => ({ status: "ok", edge_id: "e", lab_id: "l", schema_version: 1, ledger_sequence: 1533 })),
      ledger: vi.fn(async () => rows),
    } as unknown as LedgerTailApi;
    expect(await recentLedger(api, 500)).toBe(rows);
    expect(api.ledger).toHaveBeenCalledWith(1033, 500);
  });
});
