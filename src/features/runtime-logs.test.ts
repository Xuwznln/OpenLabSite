import { describe, expect, it } from "vitest";
import type { RuntimeLogBatch } from "@openlab/protocol";
import { createLogReadGuard, emptyLogWindow, filterLogLines, MAX_LOG_CHARS, MAX_LOG_LINES, mergeLogBatch } from "./runtime-logs";

function batch(overrides: Partial<RuntimeLogBatch> = {}): RuntimeLogBatch {
  return { source_id: "host", stream_id: "one", cursor: "one:20", lines: [{ offset: 0, text: "[INFO] hello" }], has_more: false, reset: false, truncated: false, path: "host.log", pid: 123, ...overrides };
}
describe("进程日志窗口", () => {
  it("重复读取不重复追加，不消耗其它读者的数据", () => {
    const data = batch();
    const first = mergeLogBatch(emptyLogWindow(), data);
    expect(mergeLogBatch(first, data)).toEqual(first);
    expect(mergeLogBatch(emptyLogWindow(), data)).toEqual(first);
    expect(mergeLogBatch(first, batch({ lines: [{ offset: 20, text: "next" }], cursor: "one:30" })).lines).toHaveLength(2);
  });
  it.each([{ stream_id: "new" }, { source_id: "slave:a" }, { reset: true }])("文件重启/来源变化/截断时清空旧窗口 %j", (change) => {
    const old = mergeLogBatch(emptyLogWindow(), batch());
    const next = mergeLogBatch(old, batch({ ...change, lines: [{ offset: 0, text: "[INFO] new process" }] }));
    expect(next.lines).toEqual([{ offset: 0, text: "[INFO] new process" }]);
  });
  it("行数与字符数双重限额", () => {
    const many = Array.from({ length: MAX_LOG_LINES + 5 }, (_, offset) => ({ offset, text: `${offset}` }));
    const capped = mergeLogBatch(emptyLogWindow(), batch({ lines: many }));
    expect(capped.lines).toHaveLength(MAX_LOG_LINES);
    expect(capped.lines[0]?.offset).toBe(5);
    expect(capped.trimmed).toBe(true);
    const large = mergeLogBatch(capped, batch({ lines: [{ offset: MAX_LOG_LINES + 6, text: "x".repeat(MAX_LOG_CHARS) }] }));
    expect(large.lines).toHaveLength(1);
  });
  it("按级别和关键词筛选时保留完整 traceback", () => {
    const rows = ["[INFO] start", "26-09-13 [02:39:01,123] [ERROR] 设备异常", "Traceback:", "  pump failed", "[DEBUG] details", "[WARNING] retry"].map((text, offset) => ({ offset, text }));
    expect(filterLogLines(rows, "ERROR", "pump").map((line) => line.text)).toEqual(rows.slice(1, 4).map((line) => line.text));
    expect(filterLogLines(rows, "WARNING", "")).toHaveLength(4);
    expect(filterLogLines(rows, "ALL", "")).toEqual(rows);
  });
  it("地址/来源切换与卸载后拒绝旧 HTTP 响应", () => {
    const guard = createLogReadGuard();
    const old = guard.capture();
    guard.invalidate();
    expect(guard.accepts(old)).toBe(false);
    expect(guard.accepts(guard.capture())).toBe(true);
  });
});
