/**
 * inventory 域：V1 Edge 库存操作面 `/api/v1/inventory/*`（unilabos/server/api/materials/inventory.py）。
 *
 * - 读路由返回 dev 的运营 DTO（物料聚合 / 批次 / 模板 / 预留），外面套 V1 信封和具名数组
 *   （`{instances: [...]}`、`{lots: [...]}`），并附 V1 的标识别名（`edge_uuid` / `lot_id` /
 *   `template_id` / `reservation_id`）。本客户端把列表的具名数组取出来直接返回数组。
 * - 列表默认 `limit=500` 截断；浏览器要全集时传 `all: true`（dev 扩展，与旧 `/materials/instances` 等价）。
 * - **`POST /inventory/commands` 是全部库存写入的唯一入口**，与其它路由一样走 V1 信封：完成为
 *   `{code: 0, data: {command_id, status: "completed", result, replayed}}`；被拒（含同一 command_id 的拒绝重放）为
 *   HTTP 200 + `{code: <业务码>, error: {msg, code: <error_code>, details: {command_id, replayed}}}`。
 *   两类命令共用：dev `materials.v1` 幂等变更信封（`protocol_version` / `command_uuid` / `operation`，
 *   原路径参数放在顶层 `target_uuid`），以及 V1 类型化命令（`type` + `command_id` + `payload`）。
 *   写方法在被拒时抛 {@link InventoryCommandRejectedError}；`command()` 把拒绝还原成 `status: "rejected"` 的结果。
 * - `/inventory/ingress-reservations` 是工站入站库位预留（信封路由）。
 */
import { BackendBusinessError, type BackendErrorInit, type HttpTransport, type JsonObject, type JsonValue } from "./common.js";
import {
  materialsMutation,
  newCommandUuid,
  type MaterialsV1Aggregate,
  type MaterialsV1Change,
  type MaterialsV1DataWrite,
  type MaterialsV1DeleteResult,
  type MaterialsV1InventoryLot,
  type MaterialsV1InventoryReservation,
  type MaterialsV1Lifecycle,
  type MaterialsV1Link,
  type MaterialsV1LotInbound,
  type MaterialsV1Move,
  type MaterialsV1MutationOptions,
  type MaterialsV1MutationResult,
  type MaterialsV1Patch,
  type MaterialsV1PositionWrite,
  type MaterialsV1Substance,
  type MaterialsV1Template,
  type MaterialsV1TemplateWrite,
  type MaterialsV1Transfer,
  type MaterialsV1TransferResult,
  type MaterialsV1Tree,
  type MaterialsV1TreeCreate,
} from "./materials-v1.js";
import type { OpenApiBody, OpenApiQuery } from "./openapi-types.js";

/** `/inventory/instances` 条目：物料聚合 + V1 别名。 */
export type InventoryInstance = MaterialsV1Aggregate & {
  edge_uuid: string;
  template_id: string;
  barcode: string;
  /** = material.lifecycle_status */
  status: MaterialsV1Lifecycle;
};

export interface InventoryRelation {
  parent_uuid: string;
  child_uuid: string;
  /** 所在库位标签；不在库位上时为空串。 */
  slot_id: string;
  site_uuid: string | null;
}

export interface InventoryInstanceDetail extends InventoryInstance {
  relation: InventoryRelation | null;
  content: { material_uuid: string; content_version: number; substances: MaterialsV1Substance[] };
}

export type InventoryLot = MaterialsV1InventoryLot & { lot_id: string; template_id: string };
export type InventoryTemplate = MaterialsV1Template & { template_id: string };
export type InventoryReservation = MaterialsV1InventoryReservation & {
  reservation_id: string;
  workflow_id: string;
  node_id: string;
};

export interface InventoryReservations {
  reservations: InventoryReservation[];
  /** 容器内容物数量预留（material_content_reservation）。 */
  content_reservations: JsonObject[];
  /** 来源绑定（task_exclusive / shared_source）。 */
  source_bindings: JsonObject[];
}

export interface InventoryWorkflowReservations extends InventoryReservations {
  workflow_id: string;
}

export interface InventoryRelations {
  /** 父子 / 库位关系。 */
  relations: InventoryRelation[];
  /** 拓扑边（dev material_link）。 */
  links: MaterialsV1Link[];
}

export interface InventoryContent {
  material_uuid: string;
  content_version: number;
  state_hash: string;
  substances: MaterialsV1Substance[];
}

export interface InventoryHealth {
  status: string;
  edge_id: string;
  lab_id: string;
  schema_version: number;
  ledger_sequence: number;
}

export interface InventorySnapshot {
  ledger_sequence: number;
  templates: InventoryTemplate[];
  lots: InventoryLot[];
  instances: InventoryInstance[];
  reservations: InventoryReservation[];
  contents: InventoryContent[];
}

export interface InventoryOutboxBacklog {
  max_sequence: number;
  acked_sequence: number;
  pending_count: number;
}

export interface InventorySyncCursor {
  name: string;
  acked_sequence: number;
  acked_at_ms: number | null;
  latest_sequence: number;
}

/**
 * `POST /inventory/commands` 的命令结果：完成时是信封 `data`；被拒时由失败信封还原
 * （`error` = `error.msg`，`error_code` = `error.code`，`code` = 业务码，`command_id` / `replayed` 取自 `error.details`）。
 */
export interface InventoryCommandResult<T = JsonValue> {
  command_id: string;
  status: "completed" | "rejected" | (string & {});
  result?: T;
  error?: string;
  /** 拒绝的符号码（如 `not_found:material`、`conflict:site_occupied`）。 */
  error_code?: string;
  /** 拒绝的 V1 业务码。 */
  code?: number;
  replayed?: boolean;
}

/** 库存命令被拒：业务码 / 符号码与信封错误同口径，`result` 是还原出的拒绝结果。 */
export class InventoryCommandRejectedError extends BackendBusinessError {
  readonly result: InventoryCommandResult<unknown>;

  constructor(result: InventoryCommandResult<unknown>, init: BackendErrorInit = {}) {
    super(
      {
        code: typeof result.code === "number" ? result.code : 1,
        error: {
          msg: result.error || `库存命令被拒（${result.status}）`,
          ...(result.error_code ? { code: result.error_code } : {}),
          details: { command_id: result.command_id, replayed: Boolean(result.replayed) },
        },
      },
      init,
    );
    this.name = "InventoryCommandRejectedError";
    this.result = result;
  }
}

/** 失败信封是不是一条库存命令的拒绝（`error.details.command_id` 存在）；是则还原成拒绝结果。 */
export function inventoryCommandRejection(error: unknown): InventoryCommandResult<never> | null {
  if (!(error instanceof BackendBusinessError) || typeof error.details?.command_id !== "string") return null;
  return {
    command_id: error.details.command_id,
    status: "rejected",
    error: error.message,
    ...(error.symbol ? { error_code: error.symbol } : {}),
    code: error.code,
    replayed: Boolean(error.details.replayed),
  };
}

/** V1 类型化命令（`reagent.dispense`、`inventory.*`、`material.*`、`content.*`、`source.*`）。 */
export interface InventoryTypedCommandOptions {
  /** 幂等键；缺省随机生成。同 command_id 同请求重放首次结果，不同请求 3003。 */
  commandId?: string;
  actor?: string;
  /** 实例 = 物料版本、内容物 = content_version、批次 = 批次版本（不符 3003）。 */
  expectedVersion?: number;
}

export interface InventoryListOptions {
  /** 不截断（dev 扩展，与旧 `/materials/*` 列表等价）。 */
  all?: boolean;
  limit?: number;
}

export type InventoryIngressReserveInput = OpenApiBody<"/api/v1/inventory/ingress-reservations", "post">;
export type InventoryIngressQuery = OpenApiQuery<"/api/v1/inventory/ingress-reservations", "get">;

/**
 * 命令入口把 `payload` 与类型化请求体的完整 dump 逐字段比对（`mutation.payload differs from the typed
 * request body`），所以模板写入要把 ResourceTemplateWrite 的每个字段显式带上（缺省值与后端一致）。
 */
export function resourceTemplateWrite(value: MaterialsV1TemplateWrite, templateUuid: string | null): JsonObject {
  return {
    template_uuid: templateUuid,
    name: value.name,
    display_name: value.display_name ?? null,
    resource_type: value.resource_type ?? "resource",
    class_name: value.class_name ?? null,
    module_name: value.module_name ?? null,
    template_version: value.template_version ?? "1",
    category: value.category ?? [],
    available_sites: value.available_sites ?? [],
    handles: (value.handles ?? []) as unknown as JsonValue[],
    definition: value.definition ?? {},
    status: value.status ?? "active",
  };
}

/** MaterialSubstance 写入形态：只带可写字段；`chemical_uuid` 只在显式给出时出现（省略 ≠ 显式 null）。 */
function substanceWrite(value: MaterialsV1Substance): JsonObject {
  const write: JsonObject = {
    substance_uuid: value.substance_uuid ?? null,
    name: value.name,
    quantity: value.quantity,
    quantity_unit: value.quantity_unit,
    physical_state: value.physical_state ?? "liquid",
    composition: value.composition ?? [],
    meta_data: value.meta_data ?? {},
  };
  if (Object.prototype.hasOwnProperty.call(value, "chemical_uuid")) write.chemical_uuid = value.chemical_uuid ?? null;
  return write;
}

/** MaterialDataWrite 完整写入体（缺省值与后端一致）。 */
export function materialDataWrite(value: MaterialsV1DataWrite): JsonObject {
  return {
    data: value.data ?? {},
    substances: (value.substances ?? []).map(substanceWrite),
    sites_initialized: value.sites_initialized ?? false,
    unknown_counter: value.unknown_counter ?? null,
    state_status: value.state_status ?? "created",
    source_event_uuid: value.source_event_uuid ?? null,
    source_job_uuid: value.source_job_uuid ?? null,
    source_command_uuid: value.source_command_uuid ?? null,
    observed_at_ms: value.observed_at_ms ?? 0,
  };
}

/** MaterialPosition 完整写入体（PUT 语义：没给的字段回到缺省值；position_x/y/z 要么全给要么全空）。 */
export function materialPositionWrite(value: MaterialsV1PositionWrite): JsonObject {
  return {
    size_depth: value.size_depth ?? 0,
    size_width: value.size_width ?? 0,
    size_height: value.size_height ?? 0,
    scale_x: value.scale_x ?? 0,
    scale_y: value.scale_y ?? 0,
    scale_z: value.scale_z ?? 0,
    layout: value.layout ?? "x-y",
    position_x: value.position_x ?? null,
    position_y: value.position_y ?? null,
    position_z: value.position_z ?? null,
    position3d_x: value.position3d_x ?? 0,
    position3d_y: value.position3d_y ?? 0,
    position3d_z: value.position3d_z ?? 0,
    rotation_x: value.rotation_x ?? 0,
    rotation_y: value.rotation_y ?? 0,
    rotation_z: value.rotation_z ?? 0,
    cross_section_type: value.cross_section_type ?? "rectangle",
    extra: value.extra ?? {},
  };
}

export function createInventoryApi(http: HttpTransport) {
  const base = "/api/v1/inventory";

  const submit = <T>(body: JsonObject | object) =>
    http.request<InventoryCommandResult<T>>({ method: "POST", path: `${base}/commands`, body });

  /** 统一命令入口：拒绝还原成 `status: "rejected"` 的结果而不抛；其他业务失败 / 传输失败照常抛。 */
  async function command<T = JsonValue>(body: JsonObject | object): Promise<InventoryCommandResult<T>> {
    try {
      return await submit<T>(body);
    } catch (error) {
      const rejected = inventoryCommandRejection(error);
      if (rejected) return rejected;
      throw error;
    }
  }

  /** 写方法：完成返回 `result`；被拒抛 InventoryCommandRejectedError（保留原信封的 HTTP 状态）。 */
  async function completed<T>(body: object): Promise<T> {
    let result: InventoryCommandResult<T>;
    try {
      result = await submit<T>(body);
    } catch (error) {
      const rejected = inventoryCommandRejection(error);
      if (rejected) throw new InventoryCommandRejectedError(rejected, { status: (error as BackendBusinessError).httpStatus });
      throw error;
    }
    if (!result || result.status !== "completed") throw new InventoryCommandRejectedError(result ?? { command_id: "", status: "rejected" });
    return result.result as T;
  }

  /** dev `materials.v1` 变更 → 命令入口；返回原 `MutationResult`。 */
  const mutate = <T>(operation: string, payload: unknown, options?: MaterialsV1MutationOptions, targetUuid?: string) =>
    completed<MaterialsV1MutationResult<T>>({
      ...materialsMutation(operation, payload, options),
      ...(targetUuid ? { target_uuid: targetUuid } : {}),
    });

  return {
    // ── 读 ────────────────────────────────────────────────────────
    health: () => http.request<InventoryHealth>({ method: "GET", path: `${base}/health` }),
    /** `rootsOnly` 只返回根物料（设备与独立台面）；`name` 精确搜索；`status` 按生命周期过滤。 */
    instances: async (
      params: { rootsOnly?: boolean; name?: string; status?: MaterialsV1Lifecycle } & InventoryListOptions = {},
    ) =>
      (
        await http.request<{ instances: InventoryInstance[] }>({
          method: "GET",
          path: `${base}/instances`,
          params: {
            roots_only: params.rootsOnly ? "true" : undefined,
            name: params.name,
            status: params.status,
            limit: params.limit,
            all: params.all === false ? undefined : "true",
          },
        })
      ).instances,
    /** 单个物料聚合 + 父子 / 库位关系 + 内容物。 */
    instance: (edgeUuid: string) =>
      http.request<InventoryInstanceDetail>({ method: "GET", path: `${base}/instances/${encodeURIComponent(edgeUuid)}` }),
    /**
     * 模板目录。默认不带 registry 全量 definition（全注册表可达十几 MB）；需要时传 `includeDefinition: true`。
     */
    templates: async (params: { includeDefinition?: boolean; name?: string } & InventoryListOptions = {}) =>
      (
        await http.request<{ templates: InventoryTemplate[] }>({
          method: "GET",
          path: `${base}/templates`,
          params: {
            include_definition: params.includeDefinition ? "true" : undefined,
            name: params.name,
            limit: params.limit,
            all: params.all === false ? undefined : "true",
          },
        })
      ).templates,
    template: (templateId: string) =>
      http.request<InventoryTemplate>({ method: "GET", path: `${base}/templates/${encodeURIComponent(templateId)}` }),
    lots: async (params: { template_uuid?: string; unit?: string; include_quarantined?: boolean; limit?: number } = {}) =>
      (
        await http.request<{ lots: InventoryLot[] }>({
          method: "GET",
          path: `${base}/lots`,
          params: {
            template_uuid: params.template_uuid,
            unit: params.unit,
            include_quarantined: params.include_quarantined === undefined ? undefined : params.include_quarantined,
            limit: params.limit,
          },
        })
      ).lots,
    lot: (lotId: string) => http.request<InventoryLot>({ method: "GET", path: `${base}/lots/${encodeURIComponent(lotId)}` }),
    /** 批次 / 物料预留 + 内容物预留 + 来源绑定。 */
    reservations: (params: { task_uuid?: string; status?: string; limit?: number } = {}) =>
      http.request<InventoryReservations>({ method: "GET", path: `${base}/reservations`, params }),
    /** 批次预留或内容物预留（按 id 自动区分）。 */
    reservation: (reservationId: string) =>
      http.request<InventoryReservation | JsonObject>({
        method: "GET",
        path: `${base}/reservations/${encodeURIComponent(reservationId)}`,
      }),
    workflowReservations: (taskUuid: string) =>
      http.request<InventoryWorkflowReservations>({
        method: "GET",
        path: `${base}/workflows/${encodeURIComponent(taskUuid)}/reservations`,
      }),
    relations: (
      params: { material_uuid?: string; source_material_uuid?: string; target_material_uuid?: string; link_type?: string } = {},
    ) => http.request<InventoryRelations>({ method: "GET", path: `${base}/relations`, params }),
    contents: async (limit?: number) =>
      (await http.request<{ contents: InventoryContent[] }>({ method: "GET", path: `${base}/contents`, params: { limit } }))
        .contents,
    /** 全量状态导出（带账本游标）；体积大，只按需读取。 */
    snapshot: () => http.request<InventorySnapshot>({ method: "GET", path: `${base}/snapshot` }),
    /** 物料账本（`after_id` 即 sequence 游标）。 */
    ledger: async (afterId = 0, limit = 100) =>
      (
        await http.request<{ entries: MaterialsV1Change[] }>({
          method: "GET",
          path: `${base}/ledger`,
          params: { after_id: afterId, limit },
        })
      ).entries,
    outboxBacklog: () => http.request<InventoryOutboxBacklog>({ method: "GET", path: `${base}/outbox/backlog` }),
    outboxEvents: async (afterSequence = 0, limit = 200) =>
      (
        await http.request<{ events: MaterialsV1Change[] }>({
          method: "GET",
          path: `${base}/outbox/events`,
          params: { after_sequence: afterSequence, limit },
        })
      ).events,
    syncCursors: async () =>
      (await http.request<{ cursors: InventorySyncCursor[] }>({ method: "GET", path: `${base}/sync/cursors` })).cursors,
    processedCommands: async (limit = 200) =>
      (await http.request<{ commands: JsonObject[] }>({ method: "GET", path: `${base}/commands/processed`, params: { limit } }))
        .commands,

    // ── 工站入站预留 ──────────────────────────────────────────────
    ingressReservations: async (params: InventoryIngressQuery = {}) =>
      (await http.request<{ reservations: JsonObject[] }>({ method: "GET", path: `${base}/ingress-reservations`, params }))
        .reservations,
    ingressReservation: (reservationUuid: string) =>
      http.request<JsonObject>({ method: "GET", path: `${base}/ingress-reservations/${encodeURIComponent(reservationUuid)}` }),
    reserveIngress: (body: InventoryIngressReserveInput) =>
      http.request<JsonObject>({ method: "POST", path: `${base}/ingress-reservations`, body }),
    markIngressInTransit: (reservationUuid: string) =>
      http.request<JsonObject>({
        method: "POST",
        path: `${base}/ingress-reservations/${encodeURIComponent(reservationUuid)}/in-transit`,
      }),
    receiveIngress: (reservationUuid: string) =>
      http.request<JsonObject>({
        method: "POST",
        path: `${base}/ingress-reservations/${encodeURIComponent(reservationUuid)}/receive`,
      }),
    cancelIngress: (reservationUuid: string, reason: string) =>
      http.request<JsonObject>({
        method: "POST",
        path: `${base}/ingress-reservations/${encodeURIComponent(reservationUuid)}/cancel`,
        body: { reason },
      }),

    // ── 写：统一命令入口 ──────────────────────────────────────────
    /** 原样提交一条命令，返回命令结果（拒绝还原为 `status: "rejected"`，不抛）。 */
    command,
    /** V1 类型化命令；被拒抛 InventoryCommandRejectedError。 */
    typedCommand: <T = JsonObject>(type: string, payload: JsonObject, options: InventoryTypedCommandOptions = {}) =>
      completed<T>({
        command_id: options.commandId ?? newCommandUuid(),
        type,
        payload,
        ...(options.actor ? { actor: options.actor } : {}),
        ...(options.expectedVersion !== undefined ? { expected_version: options.expectedVersion } : {}),
      }),
    /** 新建模板（权威分配 uuid）。 */
    createTemplate: (value: MaterialsV1TemplateWrite, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Template>("put_template", resourceTemplateWrite(value, null), options),
    putTemplate: (templateUuid: string, value: MaterialsV1TemplateWrite, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Template>("put_template", resourceTemplateWrite(value, templateUuid), options),
    deleteTemplate: (templateUuid: string, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Template>("delete_template", { template_uuid: templateUuid }, options),
    /**
     * 物料出库/实例化：按 registry 资源类名在微后端实例化并权威登记（权威发 uuid）。
     * 返回整棵权威树；根节点即 ResourceSlot 引用 {id: name, uuid} 的来源。
     */
    instantiate: (registryClass: string, name: string, barcode?: string, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Tree>(
        "instantiate_material",
        { registry_class: registryClass, name, ...(barcode ? { barcode } : {}) },
        options,
      ),
    /**
     * 直接提交一棵完整的创建树（本地已有草稿时使用；出库请用 instantiate）。命令入口按类型化请求体的
     * 完整 dump 比对，节点的 identity / position / data / sites 须带全字段（与后端缺省值一致）。
     */
    createTree: (value: MaterialsV1TreeCreate, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Tree>("create_material_tree", value, options),
    /**
     * 标识字段局部更新。服务端把 payload 与 MaterialPatch 的完整 dump 逐字段比对，
     * 未设置的字段必须显式为 null，这里统一补齐（只传 {barcode} 也能通过）。
     */
    patch: (materialUuid: string, value: MaterialsV1Patch, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Aggregate>(
        "patch_material",
        {
          name: value.name ?? null,
          display_name: value.display_name ?? null,
          description: value.description ?? null,
          machine_name: value.machine_name ?? null,
          barcode: value.barcode ?? null,
          barcode_symbology: value.barcode_symbology ?? null,
          icon_uri: value.icon_uri ?? null,
          config: value.config ?? null,
          extra: value.extra ?? null,
          meta_data: value.meta_data ?? null,
          lifecycle_status: value.lifecycle_status ?? null,
        },
        options,
        materialUuid,
      ),
    /** 整份替换数据与内容物（缺省字段按后端缺省值补齐，内容物只带可写字段）。 */
    putData: (materialUuid: string, value: MaterialsV1DataWrite, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Aggregate>("put_data", materialDataWrite(value), options, materialUuid),
    /** 整份替换位置 / 尺寸（PUT 语义，没给的字段回到缺省值）。 */
    putPosition: (materialUuid: string, value: MaterialsV1PositionWrite, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Aggregate>("put_position", materialPositionWrite(value), options, materialUuid),
    remove: (materialUuid: string, recursive = true, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1DeleteResult>("delete_material", { material_uuid: materialUuid, recursive }, options),
    /** 同一权威内换位点/换父物料（不驱动设备同步）。 */
    move: (value: MaterialsV1Move, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1Aggregate>(
        "move_material",
        {
          material_uuid: value.material_uuid,
          destination_site_uuid: value.destination_site_uuid ?? null,
          parent_material_uuid: value.parent_material_uuid ?? null,
        },
        options,
      ),
    /** 跨设备转运：权威位置提交 + 两端设备 resource service 同步，返回即两端已确认。 */
    transfer: (value: MaterialsV1Transfer, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1TransferResult>(
        "transfer_material",
        {
          source_device_id: value.source_device_id,
          target_device_id: value.target_device_id,
          items: value.items.map((item) => ({
            material_uuid: item.material_uuid,
            target_material_uuid: item.target_material_uuid,
            target_site: item.target_site ?? null,
          })),
        },
        options,
      ),
    /**
     * 批次入库 / 补充。服务端会把 payload 与 InventoryLotInbound 的完整 dump 逐字段比对，
     * 因此可选字段必须显式带上（null / 空串），这里统一补齐。
     */
    inboundLot: (value: MaterialsV1LotInbound, options?: MaterialsV1MutationOptions) =>
      mutate<MaterialsV1InventoryLot>(
        "inbound_inventory_lot",
        {
          lot_uuid: value.lot_uuid ?? null,
          template_uuid: value.template_uuid,
          batch_no: value.batch_no ?? "",
          unit: value.unit,
          quantity: value.quantity,
          expiry_at_ms: value.expiry_at_ms ?? null,
          // V1：批次所在库位与仓储分区（补充入库不改变既有位置）
          location_site_uuid: value.location_site_uuid ?? null,
          warehouse_zone_id: value.warehouse_zone_id ?? "",
        },
        options,
      ),
  };
}

export type InventoryApi = ReturnType<typeof createInventoryApi>;
