/**
 * 编排画布 → Workflow Authority 的提交载荷。
 *
 * 新契约（与 Uni-Lab-OS 的 @workflow 声明式步骤同一套）：
 * - 节点不引用 workflow_node_template，靠 `type` + `material_uuid` + `action_name` 描述；
 * - 执行顺序写在 `execution_policy.depends_on`（上游节点 uuid 列表），`edges` 为空——
 *   Handle 连线属于节点模板体系，Host 本地没有模板目录；
 * - 节点 uuid 在绑定权威定义后是稳定身份：首次提交时分配，随草稿保存，再提交复用；
 *   未绑定定义的导入草稿不复用外部 UUID，避免跨 Workflow 的软删除身份冲突；
 * - 流程：POST /workflows（或复用已绑定的定义）→ PUT /workflows/{uuid}/graph（revision 乐观锁）
 *   → POST /workflow-tasks。
 */
import type {
  BackendGraphWriteInput,
  BackendWorkflow,
  BackendWorkflowGraph,
  BackendWorkflowNodeWrite,
  BackendWorkflowTask,
  BackendWorkflowTaskSubmitInput,
  BackendWorkflowWriteInput,
  JsonObject,
} from "@openlab/protocol";
import { ApiError, BackendBusinessError } from "@openlab/protocol";
import { LOOP_NODE_TYPE, loopSpecFromNodeData, type LoopNodeData } from "./workflow-loops";

export interface SubmitNodeInput {
  id: string;
  type: string;
  /** 绝对坐标（组内成员由调用方换算好） */
  position: { x: number; y: number };
  data: Record<string, unknown>;
  /** 画布分组（模板插入成组）：记到 meta_data.editor_group，任务视图按组归拢 */
  group?: { id: string; name: string; description: string; template_id?: string };
  /** 所在循环容器的节点 id（循环体成员）→ 提交为 parent_uuid */
  loopId?: string;
}

export interface SubmitEdgeInput {
  source: string;
  target: string;
  mappings: { sourceKey: string; targetKey: string }[];
}

export interface DeviceBinding {
  materialUuid?: string;
  /** 该设备某动作的 action_type（registry）与 always_free 元数据。 */
  action?: (actionName: string) => { actionType?: string; alwaysFree?: boolean } | undefined;
}

export interface BuildAuthorityGraphInput {
  nodes: SubmitNodeInput[];
  edges: SubmitEdgeInput[];
  disabled: Set<string>;
  resolveDevice: (deviceId: string) => DeviceBinding | undefined;
  /** 已分配过的稳定 uuid（节点 id → uuid），来自草稿里的 data.uuid。 */
  existingUuids?: Map<string, string>;
  /**
   * 是否复用草稿中已有的节点身份。新建定义时必须关闭：导入的草稿可能
   * 携带另一个 Workflow 的软删除 UUID，Backend 仍会拒绝跨工作流复用。
   */
  reuseExistingUuids?: boolean;
}

export interface AuthorityGraphBuild {
  nodes: BackendWorkflowNodeWrite[];
  /** 节点 id → 权威 uuid（新分配的也在里面，调用方写回草稿）。 */
  uuidByNodeId: Map<string, string>;
  warnings: string[];
  /**
   * 本机调度器目前只接 `device_action`（其它 executor_kind 会在派发前以 plan_not_executable 失败）。
   * 这里列出不能本地运行的节点，调用方决定：保存定义可以，直接运行要拦。
   */
  notLocallyExecutable: { id: string; name: string; type: string }[];
}

/** 本机调度器已接线的执行器种类（unilabos scheduler `_build_dag`）：设备动作与循环容器。 */
export const LOCALLY_EXECUTABLE_KINDS: ReadonlySet<string> = new Set(["device_action", LOOP_NODE_TYPE]);

/** Host 自己的执行节点；人工确认等"无设备"动作挂在它上面。 */
export const HOST_NODE_ID = "host_node";
export const MANUAL_CONFIRM_ACTION = "manual_confirm";
export const DEFAULT_MANUAL_CONFIRM_TIMEOUT_S = 3600;

export class SubmitGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmitGraphError";
  }
}

// 后端用 Python UUID() 校验身份，不限制版本；这里也接受 v6/v7 等新版本，
// 但排除 nil UUID。导入的旧草稿可能来自不同 UUID 实现，不能只用 v1-v5。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function isUsableUuid(value: unknown): value is string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(normalized) && normalized.toLowerCase() !== NIL_UUID;
}

function uniqueNodeUuid(
  used: Set<string>,
): string {
  let candidate = newNodeUuid();
  while (used.has(candidate.toLowerCase())) candidate = newNodeUuid();
  return candidate;
}

function materialUuidOrUndefined(value: unknown): string | undefined {
  return isUsableUuid(value) ? value.trim() : undefined;
}

/** 人工确认的指派列表在旧导出里偶尔会是数字；后端协议要求字符串数组。 */
function normalizeAssigneeUserIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new SubmitGraphError(`${label} 的 assignee_user_ids 必须是列表`);
  }
  return value
    .map((item) => {
      if (typeof item !== "string" && typeof item !== "number") {
        throw new SubmitGraphError(`${label} 的 assignee_user_ids 必须只包含字符串或数字 ID`);
      }
      return String(item).trim();
    })
    .filter(Boolean);
}

/** RFC 4122 预定义的 URL 命名空间。 */
export const UUID_NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
/** uuid5(NAMESPACE_URL, "unilabos://workflow")：与后端 registry/workflows.py 的 WORKFLOW_NAMESPACE 相同。 */
export const WORKFLOW_NAMESPACE = "4ddd44d7-b60e-5947-8211-e4b1355199b4";

function uuidToBytes(value: string): Uint8Array {
  const hex = value.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** RFC 4122 v5（SHA-1 命名 uuid），与 Python `uuid.uuid5` 逐位一致。 */
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const ns = uuidToBytes(namespace);
  const text = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + text.length);
  input.set(ns, 0);
  input.set(text, ns.length);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", input));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 设备在物料权威里没有根物料（host_node、Slave 侧设备、尚未接入的设备）时的占位
 * material_uuid：与后端 `DeviceCatalog.material_uuid_of` 同一推导，只为满足图校验；
 * 调度按 `meta_data.target_device_id` 解析目标设备。
 */
export function placeholderMaterialUuid(deviceId: string): Promise<string> {
  return uuidV5(WORKFLOW_NAMESPACE, `device:${deviceId}`);
}

export function newNodeUuid(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  // 极旧环境兜底：RFC 4122 v4 形状
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

function parseJsonObject(text: unknown, what: string): JsonObject {
  const raw = typeof text === "string" && text.trim() ? text : "{}";
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SubmitGraphError(`${what} 不是合法 JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SubmitGraphError(`${what} 必须是 JSON 对象`);
  }
  return value as JsonObject;
}

/**
 * 画布的库存需求 → 权威 InventoryRequirement。
 *
 * 两种账目形态：`{template_id, quantity, unit[, key]}` 是 `lot`（按量，从 inventory_lot 预留扣减）；
 * 不带数量、或显式 `kind: "material"` 的是 `material`（按件，调度器从该模板的 active 实例里选一件，
 * 以 `{"uuid": ...}` 引用注入 key 同名参数——host_node/apply_deduct_resource 的 `resource` 即此用法）。
 */
function inventoryRequirements(text: unknown, nodeLabel: string, warnings: string[]): JsonObject[] {
  const raw = typeof text === "string" && text.trim() ? text : "[]";
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new SubmitGraphError(`${nodeLabel} 的库存需求不是合法 JSON`);
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((item, index): JsonObject[] => {
    if (item === null || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const templateUuid = String(record.template_uuid ?? record.template_id ?? "").trim();
    if (!templateUuid) return [];
    const quantity = Number(record.quantity);
    const hasQuantity = Number.isFinite(quantity) && quantity > 0;
    const kind = record.kind === "material" || record.kind === "lot" ? record.kind : hasQuantity ? "lot" : "material";
    if (kind === "lot" && !hasQuantity) return [];
    const key = String(record.key ?? "").trim();
    if (!key) {
      warnings.push(`${nodeLabel} 的库存需求未指定注入参数名（key），按 "inventory" 注入；请确认动作有同名参数`);
    }
    const requirement: JsonObject = {
      key: key || (index === 0 ? "inventory" : `inventory_${index + 1}`),
      kind,
      template_uuid: templateUuid,
    };
    if (kind === "lot") {
      requirement.quantity = quantity;
      requirement.unit = String(record.unit ?? "").trim() || null;
    }
    return [requirement];
  });
}

export async function buildAuthorityGraph(input: BuildAuthorityGraphInput): Promise<AuthorityGraphBuild> {
  const warnings: string[] = [];
  const mapped = input.edges.filter((edge) => edge.mappings.length > 0);
  if (mapped.length) {
    throw new SubmitGraphError(
      `有 ${mapped.length} 条连线带参数传递（如 ${mapped[0].mappings[0].sourceKey} → ${mapped[0].mappings[0].targetKey}）。` +
        "参数传递需要节点模板的 Handle，本机 Host 不提供模板目录；请把值直接写进目标节点参数，连线只保留执行顺序。",
    );
  }

  const uuidByNodeId = new Map<string, string>();
  const usedNodeUuids = new Set<string>();
  const nodeUuidOwners = new Map<string, string>();
  const reuseExistingUuids = input.reuseExistingUuids !== false;
  for (const node of input.nodes) {
    const stored = reuseExistingUuids
      ? (input.existingUuids?.get(node.id) ?? node.data.uuid)
      : undefined;
    const storedText = typeof stored === "string" ? stored.trim() : "";
    const storedKey = storedText.toLowerCase();
    let uuid: string;
    if (isUsableUuid(storedText) && !usedNodeUuids.has(storedKey)) {
      uuid = storedText;
    } else {
      uuid = uniqueNodeUuid(usedNodeUuids);
      if (isUsableUuid(storedText) && usedNodeUuids.has(storedKey)) {
        const owner = nodeUuidOwners.get(storedKey) ?? "前一个节点";
        warnings.push(
          `节点 ${node.id} 与 ${owner} 复用了同一个 UUID ${storedText}，已为当前节点重新分配唯一 UUID`,
        );
      }
    }
    uuidByNodeId.set(node.id, uuid);
    usedNodeUuids.add(uuid.toLowerCase());
    nodeUuidOwners.set(uuid.toLowerCase(), node.id);
  }

  const upstream = new Map<string, string[]>();
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  for (const edge of input.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    const list = upstream.get(edge.target) ?? [];
    const sourceUuid = uuidByNodeId.get(edge.source)!;
    if (!list.includes(sourceUuid)) list.push(sourceUuid);
    upstream.set(edge.target, list);
  }

  const unknownDevices = new Set<string>();
  const nodes: BackendWorkflowNodeWrite[] = [];
  const loopMemberCount = new Map<string, number>();
  for (const node of input.nodes) {
    if (node.loopId) loopMemberCount.set(node.loopId, (loopMemberCount.get(node.loopId) ?? 0) + 1);
  }
  for (const node of input.nodes) {
    // 组框只是画布上的可见边界，调用方通常已过滤；这里再兜一道
    if (node.type === "group") continue;
    const uuid = uuidByNodeId.get(node.id)!;
    const dependsOn = upstream.get(node.id) ?? [];
    const pose: JsonObject = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    const disabled = input.disabled.has(node.id);
    const groupMeta: JsonObject | undefined = node.group
      ? {
          id: node.group.id,
          name: node.group.name,
          description: node.group.description,
          ...(node.group.template_id ? { template_id: node.group.template_id } : {}),
        }
      : undefined;
    const parentUuid = node.loopId ? uuidByNodeId.get(node.loopId) : undefined;
    if (node.loopId && !parentUuid) {
      throw new SubmitGraphError(`节点 ${node.id} 所在的循环 ${node.loopId} 不在提交图里`);
    }

    if (node.type === LOOP_NODE_TYPE) {
      const data = node.data as Partial<LoopNodeData>;
      const label = String(data.label ?? "").trim() || "循环";
      const built = loopSpecFromNodeData(data, (editorNodeId) => uuidByNodeId.get(editorNodeId), {
        hasBody: (loopMemberCount.get(node.id) ?? 0) > 0,
      });
      if (built.error) throw new SubmitGraphError(`循环「${label}」：${built.error}`);
      const policy: JsonObject = {};
      if (dependsOn.length) policy.depends_on = dependsOn;
      nodes.push({
        uuid,
        name: label,
        type: LOOP_NODE_TYPE,
        pose,
        param: built.spec as unknown as JsonObject,
        execution_policy: policy,
        disabled,
        ...(parentUuid ? { parent_uuid: parentUuid } : {}),
        meta_data: { editor_node_id: node.id, ...(groupMeta ? { editor_group: groupMeta } : {}) },
      });
      continue;
    }

    if (node.type === "manual") {
      const label = String(node.data.label ?? "").trim() || "人工确认";
      const prompt = String(node.data.prompt ?? "");
      const policy: JsonObject = {};
      if (dependsOn.length) policy.depends_on = dependsOn;
      // Host 把人工确认实现成执行节点（host_node）上的一个动作（node_type=manual_confirm）：
      // 节点上选定的执行节点有这个能力就按设备动作提交，本机调度器能跑；没有才退回裸的
      // manual_confirm 节点（本地跑不了，调用方会拦）。
      const hostId = String(node.data.hostId ?? "").trim() || HOST_NODE_ID;
      const host = input.resolveDevice(hostId);
      const confirmAction = host?.action?.(MANUAL_CONFIRM_ACTION);
      if (confirmAction) {
        const timeoutSeconds = Number(node.data.timeoutSeconds);
        // 保留“字段缺失”与“显式空列表”的区别：后端把前者视为未完成配置，
        // 后者表示不指派、任何人可确认。新建的特殊节点默认带显式 []。
        const param: JsonObject = {
          timeout_seconds:
            Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
              ? Math.round(timeoutSeconds)
              : DEFAULT_MANUAL_CONFIRM_TIMEOUT_S,
        };
        if (Object.prototype.hasOwnProperty.call(node.data, "assignees")) {
          param.assignee_user_ids = normalizeAssigneeUserIds(
            node.data.assignees,
            `节点 ${node.id}`,
          );
        }
        nodes.push({
          uuid,
          name: label,
          type: "device_action",
          material_uuid: materialUuidOrUndefined(host?.materialUuid) || (await placeholderMaterialUuid(hostId)),
          action_name: MANUAL_CONFIRM_ACTION,
          action_type: confirmAction.actionType ?? null,
          pose,
          param,
          execution_policy: { ...policy, always_free: true },
          disabled,
          ...(parentUuid ? { parent_uuid: parentUuid } : {}),
          meta_data: {
            target_device_id: hostId,
            editor_node_id: node.id,
            manual_confirm: { label, prompt },
            ...(groupMeta ? { editor_group: groupMeta } : {}),
          },
        });
        continue;
      }
      if (hostId !== HOST_NODE_ID || host) {
        warnings.push(`执行节点 ${hostId} 当前没有上报 manual_confirm 动作，「${label}」按裸人工确认节点提交（本机不能运行）。`);
      }
      nodes.push({
        uuid,
        name: label,
        type: "manual_confirm",
        pose,
        param: { label, prompt },
        execution_policy: policy,
        disabled,
        ...(parentUuid ? { parent_uuid: parentUuid } : {}),
        meta_data: { editor_node_id: node.id, ...(groupMeta ? { editor_group: groupMeta } : {}) },
      });
      continue;
    }
    if (node.type !== "action") {
      throw new SubmitGraphError(`节点 ${node.id} 的类型 ${node.type} 不能提交（空位请先填充，分支在提交前已求值）`);
    }

    const deviceId = String(node.data.deviceId ?? "").trim();
    const actionName = String(node.data.actionName ?? "").trim();
    const label = `${deviceId || "?"}/${actionName || "?"}`;
    if (!deviceId) throw new SubmitGraphError(`节点 ${node.id} 没有选择设备`);
    if (!actionName) throw new SubmitGraphError(`节点 ${label} 没有选择动作`);
    const device = input.resolveDevice(deviceId);
    if (!device) unknownDevices.add(deviceId);
    // 有根物料就绑真身份；host_node / Slave 侧设备 / 尚未接入的设备用与后端相同的占位 uuid
    const materialUuid = materialUuidOrUndefined(device?.materialUuid) || (await placeholderMaterialUuid(deviceId));
    const action = device?.action?.(actionName);
    const actionType = action?.actionType || String(node.data.actionType ?? "").trim() || null;
    const param = parseJsonObject(node.data.paramJson, `节点 ${label} 的参数`);
    if (actionName === MANUAL_CONFIRM_ACTION && Object.prototype.hasOwnProperty.call(param, "assignee_user_ids")) {
      // 兼容旧导出中的数字用户 ID，同时原样保留显式 []；缺 key 仍不自动补，
      // 让后端继续区分“未传参”和“不指派任何人”。
      param.assignee_user_ids = normalizeAssigneeUserIds(param.assignee_user_ids, `节点 ${label}`);
    }
    const requirements = inventoryRequirements(node.data.requirementsJson, `节点 ${label}`, warnings);
    const policy: JsonObject = {};
    if (dependsOn.length) policy.depends_on = dependsOn;
    if (action?.alwaysFree) policy.always_free = true;
    const metaData: JsonObject = { target_device_id: deviceId, editor_node_id: node.id };
    if (requirements.length) metaData.inventory_requirements = requirements;
    if (groupMeta) metaData.editor_group = groupMeta;
    nodes.push({
      uuid,
      name: label,
      type: "device_action",
      material_uuid: materialUuid,
      action_name: actionName,
      action_type: actionType,
      pose,
      param,
      execution_policy: policy,
      disabled,
      ...(parentUuid ? { parent_uuid: parentUuid } : {}),
      meta_data: metaData,
    });
  }
  if (unknownDevices.size) {
    warnings.push(
      `设备 ${[...unknownDevices].join("、")} 当前不在设备目录里（未接入或未登记），已按 device_id 生成占位 material_uuid；` +
        "运行时按 target_device_id 解析，设备不在线任务会在派发时失败。",
    );
  }

  const notLocallyExecutable = nodes
    .filter((node) => !node.disabled && !LOCALLY_EXECUTABLE_KINDS.has(node.type))
    .map((node) => ({ id: String(node.meta_data?.editor_node_id ?? node.uuid), name: node.name, type: node.type }));
  return { nodes, uuidByNodeId, warnings, notLocallyExecutable };
}

/** 提交只依赖 workflowBackend 域的这五个方法（便于测试注入）。 */
export interface SubmitWorkflowApi {
  createWorkflow: (body: BackendWorkflowWriteInput) => Promise<BackendWorkflow>;
  updateWorkflow: (uuid: string, body: BackendWorkflowWriteInput) => Promise<BackendWorkflow>;
  workflow: (uuid: string) => Promise<BackendWorkflow>;
  saveGraph: (uuid: string, body: BackendGraphWriteInput) => Promise<BackendWorkflowGraph>;
  createTask: (body: BackendWorkflowTaskSubmitInput) => Promise<BackendWorkflowTask>;
}

export interface SubmitWorkflowInput {
  /** 已绑定的权威定义 uuid；没有则新建。 */
  workflowUuid?: string;
  name: string;
  description?: string;
  metaData?: JsonObject;
  nodes: BackendWorkflowNodeWrite[];
  /** 只保存定义与图，不创建运行。 */
  saveOnly?: boolean;
  runMode?: "normal" | "step";
}

export interface SubmitWorkflowResult {
  workflow: BackendWorkflow;
  task: BackendWorkflowTask | null;
  created: boolean;
}

/**
 * 定义 → 图 → 运行。revision 以刚读到的定义为准；撞上并发修改（3003）重读一次再试。
 */
export async function submitWorkflow(api: SubmitWorkflowApi, input: SubmitWorkflowInput): Promise<SubmitWorkflowResult> {
  const body: BackendWorkflowWriteInput = {
    name: input.name,
    tags: ["openlab-editor"],
    description: input.description ?? null,
    meta_data: { source: "openlab-editor", ...(input.metaData ?? {}) },
  };
  let workflow: BackendWorkflow;
  let created = false;
  if (input.workflowUuid) {
    try {
      workflow = await api.updateWorkflow(input.workflowUuid, body);
    } catch (error) {
      // 定义被删了：当作新建
      if (
        (error instanceof BackendBusinessError && error.isNotFound) ||
        (error instanceof ApiError && error.status === 404)
      ) {
        workflow = await api.createWorkflow(body);
        created = true;
      } else {
        throw error;
      }
    }
  } else {
    workflow = await api.createWorkflow(body);
    created = true;
  }

  let revision = workflow.revision;
  for (let attempt = 0; ; attempt++) {
    try {
      const graph = await api.saveGraph(workflow.uuid, { revision, nodes: input.nodes, edges: [] });
      workflow = graph.workflow;
      break;
    } catch (error) {
      if (attempt === 0 && error instanceof BackendBusinessError && error.isConflict) {
        revision = (await api.workflow(workflow.uuid)).revision;
        continue;
      }
      throw error;
    }
  }

  const task = input.saveOnly
    ? null
    : await api.createTask({
        execution_kind: "workflow",
        workflow_uuid: workflow.uuid,
        run_mode: input.runMode ?? "normal",
        description: `编排画布提交 · ${input.name}`,
      });
  return { workflow, task, created };
}
