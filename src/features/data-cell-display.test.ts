import { describe, expect, it } from "vitest";
import { isStructuredValue, summarizeStructuredValue } from "./data-cell-display";

describe("data table JSON summaries", () => {
  it("summarizes objects without serializing their full payload", () => {
    expect(summarizeStructuredValue({ status: "ready", retries: 2, nested: { ok: true } }))
      .toEqual({
        label: "对象 · 3 字段",
        preview: "status · retries · nested",
      });
  });

  it("summarizes arrays with a bounded preview", () => {
    expect(summarizeStructuredValue(["alpha", { id: 1 }, [2], "hidden"]))
      .toEqual({
        label: "数组 · 4 项",
        preview: "alpha · {…} · […]",
      });
  });

  it("distinguishes null from structured values", () => {
    expect(isStructuredValue(null)).toBe(false);
    expect(isStructuredValue({})).toBe(true);
    expect(isStructuredValue([])).toBe(true);
  });
});
