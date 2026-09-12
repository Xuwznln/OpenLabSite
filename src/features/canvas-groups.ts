/**
 * 画布分组：模板插入后的节点作为一个**组**落在画布上。
 *
 * 组是 Vue Flow 的父节点（type "group"）：成员节点带 `parentNode` 指向它、位置相对于组框，
 * 拖组整块一起动，成员拖到边缘时组框跟着长（expandParent）。组框自己有名字和描述
 * （来自模板），是画布上"这几步来自哪个模板、干什么"的可见边界；提交时成员节点的
 * `meta_data.editor_group` 记下所属组，任务视图可按组归拢。
 *
 * 组不是图结构：没有 handle、不进提交体、不算步骤数；解组即把成员位置换算成绝对坐标后删掉组框。
 */

import type { InjectionKey } from "vue";

export const GROUP_NODE_TYPE = "group";

/** 编辑器 provide 给组框节点的操作；运行画布不 provide，组框只展示。 */
export interface GroupActions {
  /** 该组来源模板有流程说明可看 */
  hasGuide: (templateId: string) => boolean;
  showGuide: (templateId: string) => void;
  /** 保留成员节点（换算成绝对坐标），只去掉组框 */
  ungroup: (groupId: string) => void;
  /** 删除组框与全部成员 */
  removeGroup: (groupId: string) => void;
}

export const GROUP_ACTIONS_KEY: InjectionKey<GroupActions> = Symbol("canvas-group-actions");

/** 组框内边距与标题栏高度（标题栏放名字 / 描述 / 操作按钮，成员从它下面开始排） */
export const GROUP_PADDING = 24;
export const GROUP_HEADER_HEIGHT = 58;

/** 画布节点渲染尺寸（与 dagre 布局用的 220×72 一致） */
export const CANVAS_NODE_SIZE = { width: 220, height: 72 };

export interface GroupNodeData {
  groupName: string;
  groupDescription: string;
  /** 来源模板 id（设备包模板 `registry:<uuid>` / 用户模板），有则组框可打开「流程说明」 */
  templateId?: string;
}

export interface GroupFrame {
  /** 组框左上角（绝对坐标） */
  position: { x: number; y: number };
  width: number;
  height: number;
  /** 成员从布局坐标换到组内相对坐标要加的偏移 */
  childOffset: { x: number; y: number };
}

/**
 * 按一组（已归一化到 (0,0) 起点的）布局坐标算组框：布局原点落在 origin，
 * 组框在原点外扩 padding，并在上方留出标题栏。
 */
export function frameForLayout(
  origin: { x: number; y: number },
  positions: Iterable<{ x: number; y: number }>,
  nodeSize = CANVAS_NODE_SIZE,
): GroupFrame {
  let maxX = 0;
  let maxY = 0;
  for (const p of positions) {
    maxX = Math.max(maxX, p.x + nodeSize.width);
    maxY = Math.max(maxY, p.y + nodeSize.height);
  }
  return {
    position: { x: origin.x - GROUP_PADDING, y: origin.y - GROUP_HEADER_HEIGHT - GROUP_PADDING },
    width: maxX + GROUP_PADDING * 2,
    height: maxY + GROUP_HEADER_HEIGHT + GROUP_PADDING * 2,
    childOffset: { x: GROUP_PADDING, y: GROUP_HEADER_HEIGHT + GROUP_PADDING },
  };
}

/**
 * 成员（组内相对坐标）变多 / 换位后组框需要的尺寸：只增不减，避免把已有成员夹在框外。
 */
export function fitFrame(
  children: Iterable<{ position: { x: number; y: number }; width?: number; height?: number }>,
  current: { width: number; height: number },
  nodeSize = CANVAS_NODE_SIZE,
): { width: number; height: number } {
  let width = current.width;
  let height = current.height;
  for (const child of children) {
    width = Math.max(width, child.position.x + (child.width ?? nodeSize.width) + GROUP_PADDING);
    height = Math.max(height, child.position.y + (child.height ?? nodeSize.height) + GROUP_PADDING);
  }
  return { width, height };
}

/** 从节点 style 里读组框尺寸（Vue Flow 把宽高放在 style 上）。 */
export function frameSize(style: unknown): { width: number; height: number } {
  const record = (style ?? {}) as Record<string, unknown>;
  return {
    width: parseFloat(String(record.width ?? "0")) || 0,
    height: parseFloat(String(record.height ?? "0")) || 0,
  };
}

export function frameStyle(size: { width: number; height: number }): Record<string, string> {
  return { width: `${Math.round(size.width)}px`, height: `${Math.round(size.height)}px` };
}

/** 提交体里成员节点的所属组（`meta_data.editor_group`）。 */
export interface EditorGroupMeta {
  id: string;
  name: string;
  description: string;
  template_id?: string;
}

export function groupSubmitMeta(group: { id: string; data: Record<string, unknown> }): EditorGroupMeta {
  const meta: EditorGroupMeta = {
    id: group.id,
    name: String(group.data.groupName ?? ""),
    description: String(group.data.groupDescription ?? ""),
  };
  const templateId = String(group.data.templateId ?? "");
  if (templateId) meta.template_id = templateId;
  return meta;
}

/** 组 id → 成员 id 列表（按 parentNode）。 */
export function groupMembers(
  nodes: Iterable<{ id: string; type?: string; parentNode?: string }>,
): Map<string, string[]> {
  const members = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.type === GROUP_NODE_TYPE) {
      if (!members.has(node.id)) members.set(node.id, []);
      continue;
    }
    if (!node.parentNode) continue;
    const list = members.get(node.parentNode) ?? [];
    list.push(node.id);
    members.set(node.parentNode, list);
  }
  return members;
}
