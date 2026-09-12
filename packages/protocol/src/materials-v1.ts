/**
 * UniLabOS `materials.v1` / `materials.db`（unilabos/server/api/materials/core.py）。
 *
 * 物料权威只在微后端：设备（resource_type=device）、台面、耗材、孔位都是
 * material 行，位点（site）归属其 owner material；库存批次 / 预留是同一事务边界
 * 内的计量视图。所有写请求共用 `InventoryMutation` 幂等信封
 * （command_uuid + effect_key），成功回执是 `MutationResult`。
 *
 * 浏览器写入口只保留人工操作需要的子集：模板维护、出库实例化、标识/内容物/
 * 位置修改、移动、跨设备转运、删除、拓扑边维护、批次入库；调度器专用的预留
 * 状态机与快照对齐不进前端。
 */
import type { HttpTransport, JsonObject, JsonValue } from "./common.js";

export interface MaterialsV1TemplateHandle {
  key: string;
  label: string;
  io_type: "source" | "target" | "bidirectional";
  data_type: string;
  side?: "NORTH" | "SOUTH" | "EAST" | "WEST";
  data_key?: string;
  data_source?: string;
  description: string;
  handle_schema: JsonObject;
  meta_data: JsonObject;
}

export interface MaterialsV1TemplateWrite {
  template_uuid?: string | null;
  name: string;
  display_name?: string | null;
  resource_type?: string;
  class_name?: string | null;
  module_name?: string | null;
  template_version?: string;
  category?: string[];
  available_sites?: JsonObject[];
  handles?: MaterialsV1TemplateHandle[];
  definition?: JsonObject;
  status?: "active" | "deprecated";
}

export interface MaterialsV1Template {
  template_uuid: string;
  name: string;
  display_name?: string | null;
  resource_type: string;
  class_name?: string | null;
  module_name?: string | null;
  template_version: string;
  category: string[];
  available_sites: JsonObject[];
  handles: MaterialsV1TemplateHandle[];
  /** registry 全量定义（含 config_info 展开树），体积可能很大，按需读取。 */
  definition: JsonObject;
  definition_hash: string;
  status: "active" | "deprecated" | "deleted";
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms?: number | null;
  version: number;
}

export interface MaterialsV1Position {
  size_depth: number;
  size_width: number;
  size_height: number;
  scale_x: number;
  scale_y: number;
  scale_z: number;
  layout: "2d" | "x-y" | "z-y" | "x-z";
  position_x?: number | null;
  position_y?: number | null;
  position_z?: number | null;
  position3d_x: number;
  position3d_y: number;
  position3d_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  cross_section_type: "rectangle" | "circle" | "rounded_rectangle";
  extra: JsonObject;
}

export type MaterialsV1PositionWrite = Partial<MaterialsV1Position>;

export interface MaterialsV1Substance {
  substance_uuid?: string | null;
  name: string;
  quantity: number;
  quantity_unit: string;
  physical_state: "liquid" | "solid" | "gas" | "unknown";
  composition: JsonValue[];
  meta_data: JsonObject;
}

export interface MaterialsV1DataWrite {
  data?: JsonObject;
  substances?: MaterialsV1Substance[];
  sites_initialized?: boolean;
  unknown_counter?: number | null;
  state_status?: string;
  source_event_uuid?: string | null;
  source_job_uuid?: string | null;
  source_command_uuid?: string | null;
  observed_at_ms?: number;
}

export interface MaterialsV1Data {
  data: JsonObject;
  substances: MaterialsV1Substance[];
  sites_initialized: boolean;
  unknown_counter?: number | null;
  state_status: string;
  source_event_uuid?: string | null;
  source_job_uuid?: string | null;
  source_command_uuid?: string | null;
  observed_at_ms: number;
  content_version: number;
  state_hash: string;
  updated_at_ms: number;
  version: number;
}

export type MaterialsV1Lifecycle =
  | "active"
  | "reserved"
  | "in_use"
  | "quarantined"
  | "consumed"
  | "retired";

export interface MaterialsV1IdentityWrite {
  resource_id: string;
  parent_material_uuid?: string | null;
  lot_uuid?: string | null;
  name: string;
  display_name?: string;
  description?: string;
  /** `device` 表示设备行；其余为 registry resource_type（plate / well / tip_rack …）。 */
  resource_type?: string;
  class_name?: string;
  machine_name?: string;
  barcode?: string;
  barcode_symbology?: string;
  template_name: string;
  resource_schema?: JsonObject;
  model?: JsonObject;
  icon_uri?: string;
  config?: JsonObject;
  extra?: JsonObject;
  meta_data?: JsonObject;
  lifecycle_status?: MaterialsV1Lifecycle;
}

export interface MaterialsV1Identity {
  resource_id: string;
  parent_material_uuid?: string | null;
  lot_uuid?: string | null;
  name: string;
  /** 展示名；权威保证非空（缺省与 name 一致）。 */
  display_name?: string;
  description: string;
  resource_type: string;
  class_name: string;
  machine_name: string;
  barcode: string;
  barcode_symbology: string;
  template_name: string;
  resource_schema: JsonObject;
  model: JsonObject;
  icon_uri: string;
  config: JsonObject;
  extra: JsonObject;
  meta_data: JsonObject;
  lifecycle_status: MaterialsV1Lifecycle;
  template_uuid: string;
  material_uuid: string;
  ordinal: number;
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms?: number | null;
  version: number;
}

export interface MaterialsV1SiteCreate {
  schema_version?: 1;
  template_name: string;
  site_index: number | string;
  label: string;
  visible?: boolean;
  occupied_client_ref?: string | null;
  pose?: JsonObject;
  allowed_resource_categories?: string[];
  parent_link?: string;
  description?: string;
  meta_data?: JsonObject;
  extra?: JsonObject;
}

export interface MaterialsV1Site {
  site_uuid: string;
  schema_version: 1;
  template_name: string;
  site_index: number | string;
  label: string;
  visible: boolean;
  occupied_material_uuid?: string | null;
  pose: JsonObject;
  allowed_resource_categories: string[];
  parent_link: string;
  description: string;
  meta_data: JsonObject;
  extra: JsonObject;
  owner_material_uuid: string;
  ordinal: number;
  changed_by_job_uuid?: string | null;
  changed_by_command_uuid?: string | null;
  changed_at_ms: number;
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms?: number | null;
  version: number;
}

export interface MaterialsV1Aggregate {
  material: MaterialsV1Identity;
  position: MaterialsV1Position;
  position_version: number;
  data: MaterialsV1Data;
  sites: MaterialsV1Site[];
  state_hash: string;
}

export interface MaterialsV1Tree {
  root_material_uuid: string;
  snapshot_sequence: number;
  nodes: MaterialsV1Aggregate[];
  client_ref_map: Record<string, string>;
  state_hash: string;
}

export interface MaterialsV1NodeCreate {
  client_ref: string;
  parent_client_ref?: string | null;
  ordinal?: number | null;
  /** 显式给出即「带条件创建」：权威中已存在同 uuid 时冲突失败。 */
  material_uuid?: string | null;
  identity: MaterialsV1IdentityWrite;
  position?: MaterialsV1PositionWrite;
  data?: MaterialsV1DataWrite;
  sites?: MaterialsV1SiteCreate[];
}

/** 一棵待创建的物料树：parent-first，恰好一个根。 */
export interface MaterialsV1TreeCreate {
  nodes: MaterialsV1NodeCreate[];
}

export interface MaterialsV1Patch {
  name?: string;
  display_name?: string;
  description?: string;
  machine_name?: string;
  barcode?: string;
  barcode_symbology?: string;
  icon_uri?: string;
  config?: JsonObject;
  extra?: JsonObject;
  meta_data?: JsonObject;
  lifecycle_status?: MaterialsV1Lifecycle;
}

export interface MaterialsV1Move {
  material_uuid: string;
  /** 目标位点；与 parent_material_uuid 至少给一个。 */
  destination_site_uuid?: string | null;
  parent_material_uuid?: string | null;
}

export interface MaterialsV1TransferItem {
  material_uuid: string;
  target_material_uuid: string;
  /** 目标位点：ResourceSite uuid 或 label / index 便捷写法。 */
  target_site?: number | string | null;
}

/** 跨设备转运：微后端提交权威位置并驱动两端设备 resource service 同步。 */
export interface MaterialsV1Transfer {
  source_device_id: string;
  target_device_id: string;
  items: MaterialsV1TransferItem[];
}

export interface MaterialsV1TransferResult {
  source_device_id: string;
  target_device_id: string;
  material_uuids: string[];
  target_material_uuids: string[];
  destination_site_uuids: Array<string | null>;
  materials: MaterialsV1Aggregate[];
}

export interface MaterialsV1DeleteResult {
  root_material_uuid: string;
  deleted_material_uuids: string[];
  deleted_site_uuids: string[];
}

export interface MaterialsV1Link {
  link_uuid: string;
  source_material_uuid: string;
  target_material_uuid: string;
  link_type: string;
  source_handle: string;
  target_handle: string;
  extra_json?: JsonObject;
  extra?: JsonObject;
  created_at_ms: number;
  updated_at_ms: number;
  version: number;
}

export interface MaterialsV1LinkUpsert {
  source_material_uuid: string;
  target_material_uuid: string;
  link_type?: string;
  source_handle?: string;
  target_handle?: string;
  extra?: JsonObject;
}

export type MaterialsV1AggregateType = "resource_template" | "material" | "site" | "lot" | "reservation";

export interface MaterialsV1Change {
  sequence: number;
  event_uuid: string;
  aggregate_type: MaterialsV1AggregateType;
  aggregate_uuid: string;
  operation: string;
  previous_version: number;
  aggregate_version: number;
  state_hash: string;
  delta: JsonObject;
  job_uuid?: string | null;
  command_uuid?: string | null;
  effect_key?: string | null;
  actor_type: string;
  actor_uuid?: string | null;
  occurred_at_ms: number;
  delivery_status: "pending" | "sent" | "acknowledged" | "dead_letter";
}

export interface MaterialsV1LotInbound {
  lot_uuid?: string | null;
  template_uuid: string;
  batch_no?: string;
  unit: string;
  quantity: number;
  expiry_at_ms?: number | null;
}

export interface MaterialsV1InventoryLot {
  lot_uuid: string;
  template_uuid: string;
  batch_no: string;
  unit: string;
  quantity_total: number;
  quantity_available: number;
  quantity_reserved: number;
  expiry_at_ms?: number | null;
  quarantined: boolean;
  created_at_ms: number;
  updated_at_ms: number;
  version: number;
}

/**
 * 库存需求 / 分配的账目形态（不是物料种类）：`material` 是有 uuid、可放位点的实例（按件），
 * `lot` 是 inventory_lot 的按量库存（散装试剂或耗材，按 lot FIFO 预留与扣减）。
 */
export type MaterialsV1InventoryKind = "material" | "lot";

export interface MaterialsV1InventoryAllocation {
  key: string;
  kind: MaterialsV1InventoryKind;
  material_uuid?: string | null;
  template_uuid: string;
  lot_uuid?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface MaterialsV1InventoryReservation {
  reservation_uuid: string;
  task_uuid: string;
  node_uuid: string;
  job_uuid: string;
  scheduler_revision: number;
  request_hash: string;
  items: MaterialsV1InventoryAllocation[];
  status: "active" | "consumed" | "released" | "canceled" | "expired" | "quarantined";
  expires_at_ms?: number | null;
  created_at_ms: number;
  updated_at_ms: number;
  version: number;
}

/** registry 可实例化资源类目录条目（出库选择器数据源）。 */
export interface MaterialsV1RegistryClass {
  registry_class: string;
  display_name: string;
}

/** 前端请求 edge hostnode 把权威已完成的变更分发到目标设备。 */
export interface MaterialsV1NotifyDevice {
  device_id: string;
  action?: "add" | "update" | "remove";
  resource_uuids: string[];
}

export interface MaterialsV1NotifyDeviceResult {
  /** true=设备已确认投影；false=通知失败；null=设备未注册被跳过。 */
  notified: boolean | null;
}

export interface MaterialsV1Precondition {
  aggregate_type: MaterialsV1AggregateType;
  aggregate_uuid: string;
  expected_version?: number;
  expected_state_hash?: string;
}

/** 所有写请求共用的幂等信封（InventoryMutation）。 */
export interface MaterialsV1Mutation<TPayload = JsonObject> {
  protocol_version: "materials.v1";
  command_uuid: string;
  effect_key: string;
  operation: string;
  actor_type: string;
  actor_uuid?: string | null;
  job_uuid?: string | null;
  observed_at_ms?: number;
  preconditions?: MaterialsV1Precondition[];
  payload: TPayload;
}

export interface MaterialsV1AggregateVersion {
  aggregate_type: MaterialsV1AggregateType;
  aggregate_uuid: string;
  version: number;
  state_hash: string;
}

/** 写操作回执信封（MutationResult）。 */
export interface MaterialsV1MutationResult<T> {
  protocol_version: "materials.v1";
  command_uuid: string;
  effect_key: string;
  replayed: boolean;
  changed: boolean;
  ledger_sequence_start: number;
  ledger_sequence_end: number;
  affected: MaterialsV1AggregateVersion[];
  data: T;
}

export interface MaterialsV1MutationOptions {
  /** 幂等键；同 command_uuid 重放返回首次结果。缺省随机生成。 */
  commandUuid?: string;
  /** 幂等作用键；缺省 `${operation}:${commandUuid}`。 */
  effectKey?: string;
  actorType?: string;
  actorUuid?: string | null;
  preconditions?: MaterialsV1Precondition[];
}

export function newCommandUuid(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 微后端 `KNOWN_ACTOR_TYPES`（unilabos.protocol.materials）：变更来源，落账本并渲染"来源" tag。
 * 浏览器 / 操作员直接发起的写操作用 `human`（微后端契约要求前端显式携带，不依赖默认值 `edge`）。
 */
export const MATERIALS_ACTOR_TYPES = [
  "human",
  "graph",
  "registry",
  "device",
  "virtual_device",
  "scheduler",
  "workflow",
  "backend",
  "edge",
] as const;
export type MaterialsActorType = (typeof MATERIALS_ACTOR_TYPES)[number];

/** 浏览器写操作的 actor_type。 */
export const BROWSER_ACTOR_TYPE: MaterialsActorType = "human";

/** 构造 materials.v1 写请求信封；浏览器发起的写操作 actor_type 为 human（微后端契约）。 */
export function materialsMutation<TPayload>(
  operation: string,
  payload: TPayload,
  options: MaterialsV1MutationOptions = {},
): MaterialsV1Mutation<TPayload> {
  const commandUuid = options.commandUuid ?? newCommandUuid();
  return {
    protocol_version: "materials.v1",
    command_uuid: commandUuid,
    effect_key: options.effectKey ?? `${operation}:${commandUuid}`,
    operation,
    actor_type: options.actorType ?? BROWSER_ACTOR_TYPE,
    actor_uuid: options.actorUuid ?? null,
    observed_at_ms: Date.now(),
    preconditions: options.preconditions ?? [],
    payload,
  };
}

export function createMaterialsV1Api(http: HttpTransport) {
  const base = "/api/v1/materials";
  return {
    // ── 模板 ──────────────────────────────────────────────────────
    /**
     * 模板目录。默认带 registry 全量 definition（全注册表可达十几 MB）；
     * 选择器 / 列表场景传 `{ includeDefinition: false }` 只取目录字段（definition 为 {}）。
     */
    templates: (options: { includeDefinition?: boolean } = {}) =>
      http.request<MaterialsV1Template[]>({
        method: "GET",
        path: `${base}/templates`,
        params: options.includeDefinition === false ? { include_definition: "false" } : undefined,
      }),
    template: (templateUuid: string) =>
      http.request<MaterialsV1Template>({ method: "GET", path: `${base}/templates/${encodeURIComponent(templateUuid)}` }),
    createTemplate: (value: MaterialsV1TemplateWrite, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Template>>({
        method: "POST",
        path: `${base}/templates`,
        body: materialsMutation("put_template", { ...value, template_uuid: null }, options),
      }),
    putTemplate: (templateUuid: string, value: MaterialsV1TemplateWrite, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Template>>({
        method: "PUT",
        path: `${base}/templates/${encodeURIComponent(templateUuid)}`,
        body: materialsMutation("put_template", { ...value, template_uuid: templateUuid }, options),
      }),
    deleteTemplate: (templateUuid: string, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Template>>({
        method: "DELETE",
        path: `${base}/templates/${encodeURIComponent(templateUuid)}`,
        body: materialsMutation("delete_template", { template_uuid: templateUuid }, options),
      }),
    /** registry 可实例化资源类目录（物料出库选择器数据源）。 */
    registryClasses: () =>
      http.request<MaterialsV1RegistryClass[]>({ method: "GET", path: `${base}/registry-classes` }),

    // ── 物料聚合 ──────────────────────────────────────────────────
    /** `rootsOnly` 只返回根物料（设备与独立台面）；`name` 精确搜索。 */
    instances: (rootsOnly = false, name?: string) =>
      http.request<MaterialsV1Aggregate[]>({
        method: "GET",
        path: `${base}/instances`,
        params: { roots_only: rootsOnly ? "true" : "false", name },
      }),
    byResourceId: (resourceId: string) =>
      http.request<MaterialsV1Aggregate>({ method: "GET", path: `${base}/instances/by-resource-id/${encodeURIComponent(resourceId)}` }),
    instance: (materialUuid: string) =>
      http.request<MaterialsV1Aggregate>({ method: "GET", path: `${base}/instances/${encodeURIComponent(materialUuid)}` }),
    tree: (materialUuid: string) =>
      http.request<MaterialsV1Tree>({ method: "GET", path: `${base}/instances/${encodeURIComponent(materialUuid)}/tree` }),
    /**
     * 物料出库/实例化：按 registry 资源类名在微后端实例化并权威登记（权威发 uuid）。
     * 返回整棵权威树；根节点即 ResourceSlot 引用 {id: name, uuid} 的来源。
     */
    instantiate: (registryClass: string, name: string, barcode?: string, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Tree>>({
        method: "POST",
        path: `${base}/instantiate`,
        body: materialsMutation(
          "instantiate_material",
          { registry_class: registryClass, name, ...(barcode ? { barcode } : {}) },
          options,
        ),
      }),
    /** 直接提交一棵完整的创建树（本地已有草稿时使用；出库请用 instantiate）。 */
    createTree: (value: MaterialsV1TreeCreate, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Tree>>({
        method: "POST",
        path: `${base}/trees`,
        body: materialsMutation("create_material_tree", value, options),
      }),
    /**
     * 标识字段局部更新。服务端把 payload 与 MaterialPatch 的完整 dump 逐字段比对，
     * 未设置的字段必须显式为 null，这里统一补齐（只传 {barcode} 也能通过）。
     */
    patch: (materialUuid: string, value: MaterialsV1Patch, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Aggregate>>({
        method: "PATCH",
        path: `${base}/instances/${encodeURIComponent(materialUuid)}`,
        body: materialsMutation(
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
        ),
      }),
    putData: (materialUuid: string, value: MaterialsV1DataWrite, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Aggregate>>({
        method: "PUT",
        path: `${base}/instances/${encodeURIComponent(materialUuid)}/data`,
        body: materialsMutation("put_material_data", value, options),
      }),
    putPosition: (materialUuid: string, value: MaterialsV1PositionWrite, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Aggregate>>({
        method: "PUT",
        path: `${base}/instances/${encodeURIComponent(materialUuid)}/position`,
        body: materialsMutation("put_material_position", value, options),
      }),
    remove: (materialUuid: string, recursive = true, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1DeleteResult>>({
        method: "DELETE",
        path: `${base}/instances/${encodeURIComponent(materialUuid)}`,
        body: materialsMutation("delete_material", { material_uuid: materialUuid, recursive }, options),
      }),
    /** 同一权威内换位点/换父物料（不驱动设备同步）。 */
    move: (value: MaterialsV1Move, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1Aggregate>>({
        method: "POST",
        path: `${base}/move`,
        body: materialsMutation("move_material", value, options),
      }),
    /** 跨设备转运：权威位置提交 + 两端设备 resource service 同步，返回即两端已确认。 */
    transfer: (value: MaterialsV1Transfer, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1TransferResult>>({
        method: "POST",
        path: `${base}/transfer`,
        body: materialsMutation("transfer_material", value, options),
      }),
    /** 把权威已完成的变更分发到目标设备；调用方应校验 notified 为 true。 */
    notifyDevice: (value: MaterialsV1NotifyDevice) =>
      http.request<MaterialsV1NotifyDeviceResult>({
        method: "POST",
        path: `${base}/notify-device`,
        body: { action: "add", ...value },
      }),

    // ── 拓扑边 ────────────────────────────────────────────────────
    links: (params: { material_uuid?: string; source_material_uuid?: string; target_material_uuid?: string; link_type?: string } = {}) =>
      http.request<MaterialsV1Link[]>({ method: "GET", path: `${base}/links`, params }),
    upsertLink: (value: MaterialsV1LinkUpsert) =>
      http.request<MaterialsV1Link>({ method: "POST", path: `${base}/links`, body: value }),
    deleteLink: (linkUuid: string) =>
      http.request<{ deleted: boolean }>({ method: "DELETE", path: `${base}/links/${encodeURIComponent(linkUuid)}` }),

    // ── 批次与预留 ────────────────────────────────────────────────
    lots: (params: { template_uuid?: string; unit?: string; include_quarantined?: boolean } = {}) =>
      http.request<MaterialsV1InventoryLot[]>({
        method: "GET",
        path: `${base}/lots`,
        params: {
          template_uuid: params.template_uuid,
          unit: params.unit,
          include_quarantined: params.include_quarantined === undefined ? undefined : params.include_quarantined ? "true" : "false",
        },
      }),
    lot: (lotUuid: string) =>
      http.request<MaterialsV1InventoryLot>({ method: "GET", path: `${base}/lots/${encodeURIComponent(lotUuid)}` }),
    /**
     * 批次入库 / 补充。服务端会把 payload 与 InventoryLotInbound 的完整 dump 逐字段比对，
     * 因此可选字段必须显式带上（null / 空串），这里统一补齐。
     */
    inboundLot: (value: MaterialsV1LotInbound, options?: MaterialsV1MutationOptions) =>
      http.request<MaterialsV1MutationResult<MaterialsV1InventoryLot>>({
        method: "POST",
        path: `${base}/lots/inbound`,
        body: materialsMutation(
          "inbound_inventory_lot",
          {
            lot_uuid: value.lot_uuid ?? null,
            template_uuid: value.template_uuid,
            batch_no: value.batch_no ?? "",
            unit: value.unit,
            quantity: value.quantity,
            expiry_at_ms: value.expiry_at_ms ?? null,
          },
          options,
        ),
      }),
    reservations: (params: { task_uuid?: string; status?: string } = {}) =>
      http.request<MaterialsV1InventoryReservation[]>({ method: "GET", path: `${base}/reservations`, params }),
    reservation: (reservationUuid: string) =>
      http.request<MaterialsV1InventoryReservation>({ method: "GET", path: `${base}/reservations/${encodeURIComponent(reservationUuid)}` }),
    reservationByJob: (jobUuid: string) =>
      http.request<MaterialsV1InventoryReservation>({ method: "GET", path: `${base}/reservations/by-job/${encodeURIComponent(jobUuid)}` }),

    // ── 变更账本 ──────────────────────────────────────────────────
    changes: (afterSequence = 0, limit = 100) =>
      http.request<MaterialsV1Change[]>({ method: "GET", path: `${base}/changes`, params: { after_sequence: afterSequence, limit } }),
    /**
     * SSE GET /api/v1/materials/events —— ledger sequence 游标流（Last-Event-ID 续传）。
     * 事件仅作失效通知，正文始终重新经 HTTP 读取。
     */
    eventsUrl: () => http.url(`${base}/events`),
  };
}

export type MaterialsV1Api = ReturnType<typeof createMaterialsV1Api>;
