/**
 * 工作流试运行（Dry Run）本地校验器：不提交、不下发任何设备动作，对画布
 * 全图跑一遍静态检查，输出 error/warning 两级报告。
 *
 * 后端调查结论（Uni-Lab-OS @ feat/edge-networking-and-scheduler，只读核实）：
 * `workflow/graph_validation.py` 的 validate_graph 只在写路径内触发——
 * Workflow v1 图保存（PUT /workflows/{uuid}/graph，冲突转 StoreConflict）与
 * authoring apply；Edge 调度器 POST /scheduler/workflows 提交时做环检测（422）。
 * 没有任何只读校验 / dry-run 端点，因此本模块为纯前端本地校验，不虚构端点。
 *
 * 校验项：
 * 1. 每节点未填参数清单（与卡片徽标同源：param-completeness.ts）——error；
 * 2. placeholder 未绑定项（包含在 1 的口径内，reason 区分）——error；
 * 3. @@@ 映射合法性：分段非空 / 来源节点存在——error；来源字段在上游输出
 *    schema 中找不到——warning（不阻塞）；schema 不可用时跳过该项；
 * 4. DAG 环检测（error）与孤立节点提示（warning）；
 * 5. 物料需求粗检：material_requirements 与 inventory lots 只读比对，模板
 *    查不到 / 单位不一致——warning；列表不可用记入 notes。
 * 6. 物料扣减模拟：把全图所有节点的可计量需求按模板累加，与可用批次
 *    （排除隔离 / 过期）比对，得到「需求 / 可用 / 运行后余量」台账；
 *    累计不足——error（调度器预留库存时同样会拒绝）。
 *
 * 纯函数：所有数据（schema 缓存、批次列表）由调用方注入，便于单测。
 */
import type { DeviceActionSchemaDetail } from "@openlab/protocol";
import {
  missingParamEntries,
  type MissingParamEntry,
} from "./param-completeness";

export type DryRunLevel = "error" | "warning";

export type DryRunIssueKind =
  | "missing-param"
  | "placeholder"
  | "structure"
  | "mapping"
  | "cycle"
  | "isolated"
  | "material";

export interface DryRunIssue {
  level: DryRunLevel;
  kind: DryRunIssueKind;
  /** 可定位的画布节点（点击报告条目跳转）。 */
  nodeId?: string;
  /** 节点展示名（动作名/设备）。 */
  nodeLabel?: string;
  message: string;
}

export interface DryRunNodeInput {
  id: string;
  /** "action" | "manual" | "branch" | "slot"（画布节点类型）。 */
  type: string;
  deviceId: string;
  actionName: string;
  paramJson: string;
  requirementsJson: string;
}

export interface DryRunMapping {
  sourceKey: string;
  targetKey: string;
}

export interface DryRunEdgeInput {
  id: string;
  source: string;
  target: string;
  mappings: readonly DryRunMapping[];
}

export interface DryRunLot {
  template_id: string;
  quantity_available: number;
  unit: string;
  lot_uuid?: string;
  batch_no?: string;
  /** 隔离批次不参与扣减。 */
  quarantined?: boolean;
  /** 过期批次不参与扣减（epoch ms）。 */
  expiry_at_ms?: number | null;
  /** 模板展示名（有则台账里显示）。 */
  template_name?: string;
}

export interface DryRunInput {
  nodes: readonly DryRunNodeInput[];
  edges: readonly DryRunEdgeInput[];
  /** 动作 schema 缓存，key 为 `${deviceId}|${actionName}`；未知传 null 值。 */
  schemas: ReadonlyMap<string, DeviceActionSchemaDetail | null>;
  /** inventory 批次列表；接口不可用传 null（报告 notes 说明、跳过粗检）。 */
  lots: readonly DryRunLot[] | null;
  /** 当前时刻（判断批次是否过期）；缺省 Date.now()。 */
  nowMs?: number;
}

export type DeductionStatus = "ok" | "short" | "unknown" | "unit-mismatch";

/** 物料扣减台账的一行：一个模板在整图上的累计需求与可用量。 */
export interface DryRunDeductionRow {
  template_id: string;
  template_name: string;
  unit: string;
  /** 全图累计需求量。 */
  required: number;
  /** 可用批次（排除隔离 / 过期）可用量之和；模板查不到时为 null。 */
  available: number | null;
  /** 运行后余量（available - required）；不可知为 null。 */
  remaining: number | null;
  /** 参与扣减的可用批次数。 */
  lotCount: number;
  /** 被排除的隔离 / 过期批次数。 */
  excludedLots: number;
  /** 需求来源节点（动作名或节点 id）。 */
  nodes: string[];
  status: DeductionStatus;
}

export interface DryRunReport {
  issues: DryRunIssue[];
  errorCount: number;
  warningCount: number;
  /** 非条目级说明（如物料列表不可用）。 */
  notes: string[];
  /** 物料扣减模拟台账（没有可计量需求时为空数组）。 */
  deductions: DryRunDeductionRow[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 上游动作输出候选 key（registry 输出 handle data_key + result 属性名）。 */
export function outputKeysFromSchema(
  detail: DeviceActionSchemaDetail | null,
): Set<string> | null {
  if (!detail) return null;
  const keys = new Set<string>();
  const handles = asRecord(detail.handles);
  const outputs = Array.isArray(handles?.output) ? handles.output : [];
  for (const handle of outputs) {
    const key = String(asRecord(handle)?.data_key ?? "").trim();
    if (key) keys.add(key);
  }
  const resultNode = asRecord(
    asRecord(asRecord(detail.schema)?.properties)?.result,
  );
  for (const key of Object.keys(asRecord(resultNode?.properties) ?? {})) {
    keys.add(key);
  }
  return keys;
}

function schemaKey(node: DryRunNodeInput): string {
  return `${node.deviceId}|${node.actionName}`;
}

/** 参数映射写入路径（targetKey 最后一段）按目标节点聚合。 */
export function mappedPathsByTarget(
  edges: readonly DryRunEdgeInput[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    for (const mapping of edge.mappings) {
      const segments = mapping.targetKey.split("@@@");
      const path = (segments[segments.length - 1] ?? "").trim();
      if (!path) continue;
      const list = map.get(edge.target) ?? [];
      list.push(path);
      map.set(edge.target, list);
    }
  }
  return map;
}

/** Kahn 拓扑排序找环：返回处于环上的节点 id（无环时为空数组）。 */
export function detectCycleNodes(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string }[],
): string[] {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of ids) indegree.set(id, 0);
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  return [...ids].filter((id) => !visited.has(id));
}

function nodeLabelOf(node: DryRunNodeInput): string {
  return node.actionName || node.id;
}

function missingEntryIssue(
  node: DryRunNodeInput,
  entry: MissingParamEntry,
): DryRunIssue {
  return {
    level: "error",
    kind: entry.reason === "placeholder-unselected" ? "placeholder" : "missing-param",
    nodeId: node.id,
    nodeLabel: nodeLabelOf(node),
    message: `${entry.label}`,
  };
}

interface RequirementShape {
  template_id: string;
  quantity: number;
  unit: string;
  /** reagent = 可计量扣减；material = 独立实例（只改生命周期，不扣数量）。 */
  kind: "reagent" | "material";
}

/** 兼容画布 `{template_id, quantity, unit}` 与后端 InventoryRequirement `{template_uuid, kind, ...}` 两种写法。 */
function parseRequirements(raw: string): RequirementShape[] | null {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => {
      const record = asRecord(item);
      const quantity = Number(record?.quantity ?? 0);
      const explicitKind = record?.kind === "material" || record?.kind === "reagent" ? record.kind : null;
      return {
        template_id: String(record?.template_id ?? record?.template_uuid ?? ""),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit: String(record?.unit ?? ""),
        kind: explicitKind ?? (quantity > 0 ? "reagent" : "material"),
      };
    });
  } catch {
    return null;
  }
}

/** 批次是否可参与扣减（未隔离、未过期）。 */
function lotUsable(lot: DryRunLot, nowMs: number): boolean {
  if (lot.quarantined) return false;
  if (typeof lot.expiry_at_ms === "number" && lot.expiry_at_ms > 0 && lot.expiry_at_ms <= nowMs) return false;
  return true;
}

/**
 * 全图物料扣减模拟：按模板累加需求，与可用批次比对。
 * 返回台账行（按状态严重度排序）；lots 为 null 时所有行 status=unknown。
 */
export function simulateDeductions(
  nodes: readonly DryRunNodeInput[],
  lots: readonly DryRunLot[] | null,
  nowMs = Date.now(),
): DryRunDeductionRow[] {
  const rows = new Map<string, DryRunDeductionRow>();
  for (const node of nodes) {
    if (node.type !== "action") continue;
    const requirements = parseRequirements(node.requirementsJson);
    if (!requirements) continue;
    for (const requirement of requirements) {
      if (!requirement.template_id || requirement.kind !== "reagent" || requirement.quantity <= 0) continue;
      const key = requirement.template_id;
      const row =
        rows.get(key) ??
        rows
          .set(key, {
            template_id: key,
            template_name: key,
            unit: requirement.unit,
            required: 0,
            available: null,
            remaining: null,
            lotCount: 0,
            excludedLots: 0,
            nodes: [],
            status: "unknown",
          })
          .get(key)!;
      row.required += requirement.quantity;
      if (!row.unit && requirement.unit) row.unit = requirement.unit;
      const label = nodeLabelOf(node);
      if (!row.nodes.includes(label)) row.nodes.push(label);
    }
  }
  if (lots !== null) {
    for (const row of rows.values()) {
      const matched = lots.filter((lot) => lot.template_id === row.template_id);
      if (!matched.length) {
        row.status = "unknown";
        continue;
      }
      const usable = matched.filter((lot) => lotUsable(lot, nowMs));
      row.template_name = matched.find((lot) => lot.template_name)?.template_name ?? row.template_id;
      row.lotCount = usable.length;
      row.excludedLots = matched.length - usable.length;
      row.available = usable.reduce(
        (sum, lot) => sum + (Number.isFinite(lot.quantity_available) ? lot.quantity_available : 0),
        0,
      );
      row.remaining = row.available - row.required;
      const unitMismatch = row.unit && usable.some((lot) => lot.unit && lot.unit !== row.unit);
      row.status = unitMismatch ? "unit-mismatch" : row.remaining < 0 ? "short" : "ok";
    }
  }
  const severity: Record<DeductionStatus, number> = { short: 0, "unit-mismatch": 1, unknown: 2, ok: 3 };
  return [...rows.values()].sort(
    (a, b) => severity[a.status] - severity[b.status] || a.template_name.localeCompare(b.template_name),
  );
}

export function dryRunWorkflow(input: DryRunInput): DryRunReport {
  const issues: DryRunIssue[] = [];
  const notes: string[] = [];
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const mappedPaths = mappedPathsByTarget(input.edges);

  // ── 1/2. 每节点未填参数（含 placeholder 未绑定），与卡片徽标同源 ──
  for (const node of input.nodes) {
    if (node.type === "slot") {
      issues.push({
        level: "error",
        kind: "structure",
        nodeId: node.id,
        nodeLabel: "空位",
        message: "空位未填充：点击虚线空位节点补全",
      });
      continue;
    }
    if (node.type !== "action") continue;
    if (!node.deviceId || !node.actionName) {
      issues.push({
        level: "error",
        kind: "structure",
        nodeId: node.id,
        nodeLabel: nodeLabelOf(node),
        message: !node.deviceId ? "未指定设备" : "未指定动作",
      });
    }
    const entries = missingParamEntries({
      detail: input.schemas.get(schemaKey(node)) ?? null,
      paramJson: node.paramJson,
      mappedPaths: mappedPaths.get(node.id) ?? [],
    });
    for (const entry of entries) issues.push(missingEntryIssue(node, entry));
  }

  // ── 3. @@@ 映射合法性 ──
  for (const edge of input.edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const edgeLabel = `${sourceNode ? nodeLabelOf(sourceNode) : edge.source} → ${
      targetNode ? nodeLabelOf(targetNode) : edge.target
    }`;
    for (const mapping of edge.mappings) {
      const locate: Pick<DryRunIssue, "nodeId" | "nodeLabel"> = {
        nodeId: targetNode?.id ?? edge.target,
        nodeLabel: targetNode ? nodeLabelOf(targetNode) : edge.target,
      };
      if (!sourceNode) {
        issues.push({
          level: "error",
          kind: "mapping",
          ...locate,
          message: `映射 ${mapping.sourceKey || "?"} → ${mapping.targetKey || "?"}（${edgeLabel}）：来源节点 ${edge.source} 不存在`,
        });
        continue;
      }
      if (!mapping.sourceKey.trim()) {
        issues.push({
          level: "error",
          kind: "mapping",
          ...locate,
          message: `映射 → ${mapping.targetKey || "?"}（${edgeLabel}）：来源字段为空`,
        });
      }
      const segments = mapping.targetKey.split("@@@");
      if (!mapping.targetKey.trim() || segments.some((segment) => !segment.trim())) {
        issues.push({
          level: "error",
          kind: "mapping",
          ...locate,
          message: `映射 ${mapping.sourceKey || "?"} → ${mapping.targetKey || "?"}（${edgeLabel}）：@@@ 分段存在空段`,
        });
      }
      // 来源字段可校验时比对上游输出候选；schema 不可用跳过（无法证伪）。
      const sourceKey = mapping.sourceKey.trim();
      if (sourceKey && sourceNode.type === "action") {
        const candidates = outputKeysFromSchema(
          input.schemas.get(schemaKey(sourceNode)) ?? null,
        );
        // 执行时取值根是上游返回值本身，sourceKey 必须命中返回值内部字段
        const firstSegment = sourceKey.split(".")[0];
        if (
          candidates &&
          !candidates.has(sourceKey) &&
          !candidates.has(firstSegment)
        ) {
          issues.push({
            level: "warning",
            kind: "mapping",
            ...locate,
            message: `映射 ${sourceKey} → ${mapping.targetKey}（${edgeLabel}）：上游输出 schema 中未找到该字段（不阻塞）`,
          });
        }
      }
    }
  }

  // ── 4. DAG 环 + 孤立节点 ──
  const cycleNodes = detectCycleNodes(input.nodes, input.edges);
  if (cycleNodes.length) {
    issues.push({
      level: "error",
      kind: "cycle",
      nodeId: cycleNodes[0],
      nodeLabel: nodeById.get(cycleNodes[0])
        ? nodeLabelOf(nodeById.get(cycleNodes[0])!)
        : cycleNodes[0],
      message: `检测到回路：${cycleNodes.join(" / ")}（工作流必须是有向无环图）`,
    });
  }
  if (input.nodes.length > 1) {
    const connected = new Set(
      input.edges.flatMap((edge) => [edge.source, edge.target]),
    );
    for (const node of input.nodes) {
      if (connected.has(node.id)) continue;
      issues.push({
        level: "warning",
        kind: "isolated",
        nodeId: node.id,
        nodeLabel: nodeLabelOf(node),
        message: "孤立节点：没有任何连线（仍会作为独立起点执行）",
      });
    }
  }

  // ── 5. 物料需求粗检（inventory lots 只读比对） ──
  let lotsUnavailableNoted = false;
  for (const node of input.nodes) {
    if (node.type !== "action") continue;
    const requirements = parseRequirements(node.requirementsJson);
    if (requirements === null) {
      issues.push({
        level: "warning",
        kind: "material",
        nodeId: node.id,
        nodeLabel: nodeLabelOf(node),
        message: "物料需求 JSON 不合法，无法粗检",
      });
      continue;
    }
    for (const requirement of requirements) {
      if (!requirement.template_id) continue;
      if (input.lots === null) {
        if (!lotsUnavailableNoted) {
          notes.push("物料批次列表不可用，已跳过物料需求粗检");
          lotsUnavailableNoted = true;
        }
        continue;
      }
      const matched = input.lots.filter(
        (lot) => lot.template_id === requirement.template_id,
      );
      if (!matched.length) {
        issues.push({
          level: "warning",
          kind: "material",
          nodeId: node.id,
          nodeLabel: nodeLabelOf(node),
          message: `物料模板 ${requirement.template_id} 在当前批次列表中查不到（不阻塞）`,
        });
        continue;
      }
      if (
        requirement.unit &&
        matched.some((lot) => lot.unit && lot.unit !== requirement.unit)
      ) {
        issues.push({
          level: "warning",
          kind: "material",
          nodeId: node.id,
          nodeLabel: nodeLabelOf(node),
          message: `物料 ${requirement.template_id} 单位不一致：需求 ${requirement.unit}，批次 ${matched.map((lot) => lot.unit).join("/")}`,
        });
      }
    }
  }

  // ── 6. 物料扣减模拟：全图累计需求 vs 可用批次 ──
  const deductions = simulateDeductions(input.nodes, input.lots, input.nowMs ?? Date.now());
  for (const row of deductions) {
    if (row.status !== "short" || row.available === null) continue;
    const unit = row.unit || "";
    // 累计不足是 error：调度器为任务预留库存时会以同样口径拒绝
    issues.push({
      level: "error",
      kind: "material",
      nodeLabel: row.template_name,
      message: `物料 ${row.template_name} 全图累计需求 ${row.required}${unit}，可用 ${row.available}${unit}（${row.lotCount} 批次${
        row.excludedLots ? `，另有 ${row.excludedLots} 批隔离/过期未计` : ""
      }），缺 ${Math.abs(row.remaining ?? 0)}${unit}；涉及节点：${row.nodes.join("、")}`,
    });
  }
  if (deductions.length && input.lots === null && !lotsUnavailableNoted) {
    notes.push("物料批次列表不可用，扣减台账只列出需求、无法比对可用量");
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.level === "error").length,
    warningCount: issues.filter((issue) => issue.level === "warning").length,
    notes,
    deductions,
  };
}
