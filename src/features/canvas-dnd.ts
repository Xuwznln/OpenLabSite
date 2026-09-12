/** 节点库 / 模板 / 特殊节点 → 画布的拖拽协议（HTML5 DnD，自定义 MIME）。 */

export const DRAG_MIME = "application/x-openlab-insert";

export type SpecialKind = "manual" | "slot" | "branch";

export type DragPayload =
  | {
      kind: "action";
      deviceId: string;
      actionName: string;
      param?: Record<string, unknown>;
    }
  | { kind: "template"; templateId: string }
  | { kind: "special"; special: SpecialKind };

export function setDragPayload(event: DragEvent, payload: DragPayload): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "copy";
}

export function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer?.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function hasDragPayload(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes(DRAG_MIME));
}
