/** 日志窗口仅驻留前端内存，不进入业务 store / localStorage。 */
import type { RuntimeLogBatch, RuntimeLogLine } from "@openlab/protocol";

export const MAX_LOG_LINES = 2000;
export const MAX_LOG_CHARS = 512 * 1024;
export interface LogWindow {
  sourceId: string;
  streamId: string;
  cursor: string;
  lines: RuntimeLogLine[];
  trimmed: boolean;
}
export function emptyLogWindow(): LogWindow {
  return { sourceId: "", streamId: "", cursor: "", lines: [], trimmed: false };
}
export function mergeLogBatch(previous: LogWindow, batch: RuntimeLogBatch): LogWindow {
  const fresh = previous.sourceId !== batch.source_id || previous.streamId !== batch.stream_id || batch.reset;
  const lines = fresh ? [] : [...previous.lines];
  const seen = new Set(lines.map((line) => line.offset));
  for (const line of batch.lines) {
    if (!seen.has(line.offset)) { lines.push(line); seen.add(line.offset); }
  }
  let trimmed = (!fresh && previous.trimmed) || batch.truncated;
  let chars = lines.reduce((sum, line) => sum + line.text.length, 0);
  let discard = 0;
  while (lines.length - discard > MAX_LOG_LINES || (chars > MAX_LOG_CHARS && discard < lines.length)) {
    chars -= lines[discard++]!.text.length;
    trimmed = true;
  }
  return { sourceId: batch.source_id, streamId: batch.stream_id, cursor: batch.cursor, lines: lines.slice(discard), trimmed };
}

export const LOG_LEVELS = ["ALL", "TRACE", "DEBUG", "INFO", "WARNING", "ERROR"] as const;
export type LogLevelFilter = typeof LOG_LEVELS[number];
const LEVEL_RANK: Record<string, number> = { TRACE: 0, IO: 0, DEBUG: 1, INFO: 2, SUCCESS: 2, WARNING: 3, WARN: 3, ERROR: 4, CRITICAL: 5 };
export function logLevel(text: string): string | null {
  return /^(?:\d{2,4}-\d{2}-\d{2}\s+\[[^\]]+\]\s+)?\[(TRACE|IO|DEBUG|INFO|SUCCESS|WARNING|WARN|ERROR|CRITICAL)\]/.exec(text)?.[1] ?? null;
}
/** 多行 traceback 作为一个记录筛选，不能只剩 ERROR 标题而丢掉错误栈。 */
export function filterLogLines(lines: RuntimeLogLine[], minimum: LogLevelFilter, keyword: string): RuntimeLogLine[] {
  const result: RuntimeLogLine[] = [];
  let group: RuntimeLogLine[] = [];
  let level: string | null = null;
  const search = keyword.trim().toLocaleLowerCase();
  function flush() {
    const allowed = minimum === "ALL" || (LEVEL_RANK[level ?? "INFO"] ?? 2) >= (LEVEL_RANK[minimum] ?? 0);
    if (allowed && (!search || group.some((line) => line.text.toLocaleLowerCase().includes(search)))) result.push(...group);
  }
  for (const line of lines) {
    const found = logLevel(line.text);
    if (found) { flush(); group = []; level = found; }
    group.push(line);
  }
  flush();
  return result;
}

/** 切换地址/来源后，不允许上一个 HTTP 响应覆盖新窗口。 */
export function createLogReadGuard() {
  let revision = 0;
  return { invalidate: () => { revision += 1; }, capture: () => revision, accepts: (ticket: number) => ticket === revision };
}
