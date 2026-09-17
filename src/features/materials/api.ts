/** Application-owned workflow compiler/renderer bridge; UniLab reads use its SDK. */
export async function materialApi<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.detail || `请求失败（${response.status}）`);
  return value;
}
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? `${h} 小时 ${m} 分` : m ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}
export const phaseCamera: Record<string, string> = { prepare:'A', dose:'A', mix:'A', heat:'B', recover:'C', xrd:'C', archive:'overview' };
