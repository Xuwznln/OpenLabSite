<script setup lang="ts">
/**
 * 物料工作台：materials.v1 权威的树形浏览与人工操作。
 *
 * - 左侧：根物料（设备 / 台面）→ 子物料树；右侧：选中物料的标识、位点、内容物；
 * - 操作：出库实例化、移动到位点、跨设备转运、编辑标识、删除；
 * - 下方：库存批次 / 预留 / 变更账本；模板目录按需加载（registry 全量定义体积大）。
 *
 * 数据真相始终是 HTTP；materials.changed SSE 通知只触发重拉。
 */
import { computed, h, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  NTree,
  useMessage,
  type DataTableColumns,
  type TreeOption,
} from "naive-ui";
import {
  AddOutline,
  ArchiveOutline,
  ArrowRedoOutline,
  CubeOutline,
  HardwareChipOutline,
  RefreshOutline,
  SwapHorizontalOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {
  ApiError,
  type MaterialsV1Aggregate,
  type MaterialsV1Change,
  type MaterialsV1InventoryLot,
  type MaterialsV1InventoryReservation,
  type MaterialsV1Lifecycle,
  type MaterialsV1RegistryClass,
  type MaterialsV1Site,
  type MaterialsV1Template,
} from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import PageHeader from "../components/PageHeader.vue";
import StatusPill from "../components/StatusPill.vue";
import { actorTypeLabel } from "../features/actor-type";
import { describeError } from "../features/errors";
import { createRefreshQueue } from "../features/refresh-queue";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";

const conn = useConnectionStore();
const domain = useDomainThemeStore();
const message = useMessage();
const router = useRouter();
const route = useRoute();

const aggregates = shallowRef<MaterialsV1Aggregate[]>([]);
const lots = shallowRef<MaterialsV1InventoryLot[]>([]);
const reservations = shallowRef<MaterialsV1InventoryReservation[]>([]);
const changes = shallowRef<MaterialsV1Change[]>([]);
const templates = shallowRef<MaterialsV1Template[] | null>(null);
const registryClasses = shallowRef<MaterialsV1RegistryClass[]>([]);
const loading = ref(false);
const loaded = ref(false);
const lastError = ref("");
const templatesLoading = ref(false);
const bottomTab = ref("reagents");
const selectedUuid = ref("");
const filter = ref("");

// ── 索引 ──────────────────────────────────────────────────────

const byUuid = computed(() => new Map(aggregates.value.map((item) => [item.material.material_uuid, item])));
const childrenOf = computed(() => {
  const map = new Map<string, MaterialsV1Aggregate[]>();
  for (const item of aggregates.value) {
    const parent = item.material.parent_material_uuid ?? "";
    (map.get(parent) ?? map.set(parent, []).get(parent)!).push(item);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.material.ordinal - b.material.ordinal || a.material.name.localeCompare(b.material.name));
  }
  return map;
});
const roots = computed(() => childrenOf.value.get("") ?? []);
const devices = computed(() => roots.value.filter((item) => item.material.resource_type === "device"));
const siteByUuid = computed(() => {
  const map = new Map<string, { site: MaterialsV1Site; owner: MaterialsV1Aggregate }>();
  for (const owner of aggregates.value) {
    for (const site of owner.sites) map.set(site.site_uuid, { site, owner });
  }
  return map;
});
const selected = computed(() => (selectedUuid.value ? byUuid.value.get(selectedUuid.value) ?? null : null));

/** 沿 parent 链回溯到根设备（资源所属的执行设备）。 */
function rootDeviceOf(item: MaterialsV1Aggregate | null | undefined): MaterialsV1Aggregate | null {
  let current = item ?? null;
  let guard = 0;
  while (current && guard < 32) {
    if (current.material.resource_type === "device") return current;
    const parent = current.material.parent_material_uuid;
    current = parent ? byUuid.value.get(parent) ?? null : null;
    guard += 1;
  }
  return null;
}

/** 物料当前所在位点（反查 occupied_material_uuid）。 */
function siteOf(materialUuid: string): { site: MaterialsV1Site; owner: MaterialsV1Aggregate } | null {
  for (const entry of siteByUuid.value.values()) {
    if (entry.site.occupied_material_uuid === materialUuid) return entry;
  }
  return null;
}

function displayName(item: MaterialsV1Aggregate): string {
  return item.material.display_name || item.material.name;
}

function matchesFilter(item: MaterialsV1Aggregate, keyword: string): boolean {
  const m = item.material;
  return [m.name, m.display_name ?? "", m.resource_id, m.class_name, m.barcode, m.material_uuid]
    .some((value) => value.toLowerCase().includes(keyword));
}

function subtreeMatches(item: MaterialsV1Aggregate, keyword: string): boolean {
  if (matchesFilter(item, keyword)) return true;
  return (childrenOf.value.get(item.material.material_uuid) ?? []).some((child) => subtreeMatches(child, keyword));
}

const WAREHOUSE_KEY = "__warehouse__";

const treeData = computed<TreeOption[]>(() => {
  const keyword = filter.value.trim().toLowerCase();
  const build = (item: MaterialsV1Aggregate): TreeOption | null => {
    if (keyword && !subtreeMatches(item, keyword)) return null;
    const children = (childrenOf.value.get(item.material.material_uuid) ?? [])
      .map(build)
      .filter((node): node is TreeOption => node !== null);
    return {
      key: item.material.material_uuid,
      label: displayName(item),
      children: children.length ? children : undefined,
      isLeaf: !children.length,
      prefix: () =>
        h(NIcon, { size: 14, color: item.material.resource_type === "device" ? "#087f5b" : "#8b929c" }, {
          default: () => h(item.material.resource_type === "device" ? HardwareChipOutline : CubeOutline),
        }),
      suffix: () =>
        h("span", { class: "tree-meta" }, [
          item.material.resource_type,
          item.sites.length ? ` · ${item.sites.filter((s) => s.occupied_material_uuid).length}/${item.sites.length} 位` : "",
        ]),
    };
  };
  // 设备在前；根层非设备物料 = 在库未上台，归到一个虚拟分组里，让「入库 → 在库 → 出库到位点」可见
  const deviceNodes = roots.value
    .filter((item) => item.material.resource_type === "device")
    .map(build)
    .filter((node): node is TreeOption => node !== null);
  const warehouseNodes = roots.value
    .filter((item) => item.material.resource_type !== "device")
    .map(build)
    .filter((node): node is TreeOption => node !== null);
  if (!warehouseNodes.length && keyword) return deviceNodes;
  const warehouse: TreeOption = {
    key: WAREHOUSE_KEY,
    label: "在库物料（未上台）",
    children: warehouseNodes.length ? warehouseNodes : undefined,
    isLeaf: !warehouseNodes.length,
    disabled: !warehouseNodes.length,
    prefix: () => h(NIcon, { size: 14, color: "#b45309" }, { default: () => h(ArchiveOutline) }),
    suffix: () => h("span", { class: "tree-meta" }, warehouseNodes.length ? `${warehouseNodes.length} 件` : "空"),
  };
  return [...deviceNodes, warehouse];
});

const expandedKeys = ref<string[]>([]);

/** 展开某个物料的全部祖先，让它在树里可见。 */
function revealInTree(uuid: string) {
  const keys = new Set(expandedKeys.value);
  let current = byUuid.value.get(uuid);
  let guard = 0;
  while (current?.material.parent_material_uuid && guard < 32) {
    keys.add(current.material.parent_material_uuid);
    current = byUuid.value.get(current.material.parent_material_uuid);
    guard += 1;
  }
  keys.add(WAREHOUSE_KEY);
  expandedKeys.value = [...keys];
}

/** 深链接 /inventory?material=<uuid>（EntityRef「打开物料页」）。 */
const requestedMaterial = computed(() => String(route.query.material ?? ""));

watch(roots, (list) => {
  // 默认展开设备与「在库物料」分组；在库件本身（板 / 枪头盒）折叠，免得孔位刷屏
  if (!expandedKeys.value.length) {
    expandedKeys.value = [
      ...list.filter((item) => item.material.resource_type === "device").map((item) => item.material.material_uuid),
      WAREHOUSE_KEY,
    ];
  }
  if (requestedMaterial.value && byUuid.value.has(requestedMaterial.value) && selectedUuid.value !== requestedMaterial.value) {
    selectedUuid.value = requestedMaterial.value;
    revealInTree(requestedMaterial.value);
    return;
  }
  // 首次载入默认选中第一台设备，右侧不留空白；被删除的选中项回退到根。
  if (!selectedUuid.value || !byUuid.value.has(selectedUuid.value)) {
    selectedUuid.value = list[0]?.material.material_uuid ?? "";
  }
});

watch(requestedMaterial, (uuid) => {
  if (uuid && byUuid.value.has(uuid)) {
    selectedUuid.value = uuid;
    revealInTree(uuid);
  }
});

const counts = computed(() => ({
  devices: devices.value.length,
  materials: aggregates.value.filter((item) => item.material.resource_type !== "device").length,
  sites: aggregates.value.reduce((total, item) => total + item.sites.length, 0),
  occupied: aggregates.value.reduce(
    (total, item) => total + item.sites.filter((site) => site.occupied_material_uuid).length,
    0,
  ),
}));

// ── 拉取 ──────────────────────────────────────────────────────

const refresh = createRefreshQueue(async () => {
  if (!conn.online) return;
  loading.value = true;
  const api = conn.api.domains.materialsV1;
  const [aggregateResult, lotResult, reservationResult, changeResult] = await Promise.allSettled([
    api.instances(),
    api.lots(),
    api.reservations(),
    api.changes(0, 300),
  ]);
  if (api !== conn.api.domains.materialsV1) {
    loading.value = false;
    return;
  }
  if (aggregateResult.status === "fulfilled") {
    aggregates.value = aggregateResult.value;
    lastError.value = "";
  } else {
    lastError.value = describeError(aggregateResult.reason);
  }
  if (lotResult.status === "fulfilled") lots.value = lotResult.value;
  if (reservationResult.status === "fulfilled") reservations.value = reservationResult.value;
  if (changeResult.status === "fulfilled") changes.value = [...changeResult.value].reverse();
  loaded.value = true;
  loading.value = false;
});

/** 模板目录只取目录字段（不带十几 MB 的 registry definition），可放心随页面加载。 */
async function ensureTemplates() {
  if (templates.value !== null || templatesLoading.value) return;
  templatesLoading.value = true;
  try {
    templates.value = await conn.api.domains.materialsV1.templates({ includeDefinition: false });
  } catch (error) {
    message.error(`模板目录读取失败：${describeError(error)}`);
  } finally {
    templatesLoading.value = false;
  }
}

let registryClassesPromise: Promise<void> | null = null;

async function ensureRegistryClasses() {
  if (registryClasses.value.length) return;
  registryClassesPromise ??= conn.api.domains.materialsV1
    .registryClasses()
    .then((items) => {
      registryClasses.value = items;
    })
    .catch((error) => {
      message.error(`资源类目录读取失败：${describeError(error)}`);
    })
    .finally(() => {
      registryClassesPromise = null;
    });
  await registryClassesPromise;
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void refresh();
  void ensureTemplates();
  timer = setInterval(() => void refresh(), 8000);
});
watch(
  () => conn.online,
  (online) => {
    if (online && templates.value === null) void ensureTemplates();
  },
);
onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
});
watch(() => conn.materialsNoticeRevision, () => void refresh());
watch(() => conn.online, (online) => online && void refresh());
watch(() => conn.baseUrl, () => {
  aggregates.value = [];
  lots.value = [];
  reservations.value = [];
  changes.value = [];
  templates.value = null;
  registryClasses.value = [];
  selectedUuid.value = "";
  loaded.value = false;
  lastError.value = "";
  void refresh();
});
watch(bottomTab, (tab) => {
  if (tab === "templates") void ensureTemplates();
});

// ── 实例入库（按注册表资源类实例化，落在根层 = 在库未上台） ──────────

const instantiateForm = ref({ name: "", barcode: "", quantity: 1 });
const instantiating = ref(false);

/** 该模板能否按实例入库：注册表 registry-classes 里有同名资源类。 */
function instantiableClass(template: MaterialsV1Template | null): MaterialsV1RegistryClass | null {
  if (!template) return null;
  return registryClasses.value.find((item) => item.registry_class === template.name) ?? null;
}

/** 已有实例名集合（去重、避免重复命名）。 */
const existingNames = computed(() => new Set(aggregates.value.map((item) => item.material.name)));

/**
 * 缺省实例名 = 资源类名 + 两位序号，从该类现有实例数量往后编（tips_rack_03…），
 * 跳过已占用的名字。
 */
function suggestInstanceName(template: MaterialsV1Template): string {
  const prefix = template.name;
  const count = aggregates.value.filter(
    (item) => item.material.class_name === template.class_name || item.material.template_uuid === template.template_uuid,
  ).length;
  for (let index = count + 1; index < count + 1000; index += 1) {
    const candidate = `${prefix}_${String(index).padStart(2, "0")}`;
    if (!existingNames.value.has(candidate)) return candidate;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

/** 多件时把「前缀_序号」的序号顺延；单件直接用当前名。 */
function plannedInstanceNames(): string[] {
  const form = instantiateForm.value;
  const quantity = Math.min(50, Math.max(1, Math.floor(form.quantity || 1)));
  const base = form.name.trim() || (lotTemplate.value ? suggestInstanceName(lotTemplate.value) : `material_${Date.now().toString(36)}`);
  if (quantity === 1) return [base];
  const match = /^(.*?)(\d+)$/.exec(base);
  const prefix = match ? match[1]! : `${base}_`;
  const start = match ? Number(match[2]) : 1;
  const width = match ? match[2]!.length : 2;
  const names: string[] = [];
  let cursor = start;
  while (names.length < quantity) {
    const candidate = `${prefix}${String(cursor).padStart(width, "0")}`;
    if (!existingNames.value.has(candidate)) names.push(candidate);
    cursor += 1;
  }
  return names;
}

const plannedNamesPreview = computed(() => {
  const names = plannedInstanceNames();
  if (names.length <= 3) return names.join("、");
  return `${names[0]}、${names[1]} … ${names[names.length - 1]}`;
});

async function submitInstantiate() {
  const template = lotTemplate.value;
  const registryClass = instantiableClass(template);
  if (!template || !registryClass) {
    message.warning("该类型不能按件入库，请改用「按量登记」");
    return;
  }
  const form = instantiateForm.value;
  const names = plannedInstanceNames();
  const quantity = names.length;
  instantiating.value = true;
  let created = 0;
  let firstUuid = "";
  try {
    for (let index = 0; index < quantity; index += 1) {
      const name = names[index]!;
      try {
        const result = await conn.api.domains.materialsV1.instantiate(
          registryClass.registry_class,
          name,
          quantity === 1 ? form.barcode.trim() || undefined : undefined,
        );
        created += 1;
        firstUuid ||= result.data.root_material_uuid;
      } catch (error) {
        message.error(`入库失败（${name}）：${describeError(error)}`);
      }
    }
    if (created) {
      message.success(`已入库 ${created} 件 ${template.display_name || template.name}，位于「在库物料」，可随时出库到位点`);
      lotOpen.value = false;
      await refresh();
      if (firstUuid) selectedUuid.value = firstUuid;
    }
  } finally {
    instantiating.value = false;
  }
}

// ── 移动 / 转运 ─────────────────────────────────────────────────

const moveOpen = ref(false);
const moveSiteUuid = ref<string | null>(null);
const moving = ref(false);

const vacantSiteOptions = computed(() =>
  [...siteByUuid.value.values()]
    .filter(({ site }) => !site.occupied_material_uuid || site.occupied_material_uuid === selectedUuid.value)
    .map(({ site, owner }) => ({
      label: `${displayName(owner)} · ${site.label}`,
      value: site.site_uuid,
      disabled: site.occupied_material_uuid === selectedUuid.value,
    })),
);

function openMove() {
  moveSiteUuid.value = null;
  moveOpen.value = true;
}

async function submitMove() {
  if (!selected.value || !moveSiteUuid.value) return;
  const target = siteByUuid.value.get(moveSiteUuid.value);
  if (!target) return;
  const sourceDevice = rootDeviceOf(selected.value);
  const targetDevice = rootDeviceOf(target.owner);
  moving.value = true;
  try {
    if (sourceDevice && targetDevice && sourceDevice.material.material_uuid !== targetDevice.material.material_uuid) {
      // 跨设备：走 transfer，由后端提交位置并同步两端设备。
      await conn.api.domains.materialsV1.transfer({
        source_device_id: sourceDevice.material.resource_id,
        target_device_id: targetDevice.material.resource_id,
        items: [
          {
            material_uuid: selected.value.material.material_uuid,
            target_material_uuid: target.owner.material.material_uuid,
            target_site: target.site.site_uuid,
          },
        ],
      });
      message.success(`已转运到 ${displayName(target.owner)} · ${target.site.label}`);
    } else {
      await conn.api.domains.materialsV1.move({
        material_uuid: selected.value.material.material_uuid,
        destination_site_uuid: target.site.site_uuid,
        parent_material_uuid: target.owner.material.material_uuid,
      });
      message.success(`已移动到 ${displayName(target.owner)} · ${target.site.label}`);
    }
    moveOpen.value = false;
    await refresh();
  } catch (error) {
    message.error(`移动失败：${describeError(error)}`);
  } finally {
    moving.value = false;
  }
}

// ── 编辑标识 ───────────────────────────────────────────────────

const editOpen = ref(false);
const editing = ref(false);
const editForm = ref({ display_name: "", barcode: "", description: "", lifecycle_status: "active" as MaterialsV1Lifecycle });
const LIFECYCLE_OPTIONS: MaterialsV1Lifecycle[] = ["active", "reserved", "in_use", "quarantined", "consumed", "retired"];

function openEdit() {
  if (!selected.value) return;
  const m = selected.value.material;
  editForm.value = {
    display_name: m.display_name ?? m.name,
    barcode: m.barcode,
    description: m.description,
    lifecycle_status: m.lifecycle_status,
  };
  editOpen.value = true;
}

async function submitEdit() {
  if (!selected.value) return;
  editing.value = true;
  try {
    await conn.api.domains.materialsV1.patch(selected.value.material.material_uuid, {
      display_name: editForm.value.display_name.trim() || undefined,
      barcode: editForm.value.barcode.trim(),
      description: editForm.value.description,
      lifecycle_status: editForm.value.lifecycle_status,
    });
    message.success("已更新物料标识");
    editOpen.value = false;
    await refresh();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) message.info("没有需要更新的字段");
    else message.error(`更新失败：${describeError(error)}`);
  } finally {
    editing.value = false;
  }
}

// ── 删除 ───────────────────────────────────────────────────────

const deleting = ref(false);

async function submitDelete() {
  if (!selected.value) return;
  deleting.value = true;
  try {
    const result = await conn.api.domains.materialsV1.remove(selected.value.material.material_uuid, true);
    message.success(`已删除 ${result.data.deleted_material_uuids.length} 个物料节点`);
    selectedUuid.value = "";
    await refresh();
  } catch (error) {
    message.error(`删除失败：${describeError(error)}`);
  } finally {
    deleting.value = false;
  }
}

// ── 计量库存：按注册表模板聚合可按量扣减的批次（试剂或耗材均可，与"是不是试剂"无关）──

type ReagentStatus = "ok" | "low" | "empty" | "expired";

interface ReagentStockRow {
  template_uuid: string;
  name: string;
  className: string;
  resourceType: string;
  unit: string;
  total: number;
  available: number;
  reserved: number;
  lots: MaterialsV1InventoryLot[];
  quarantinedCount: number;
  expiredCount: number;
  nearestExpiry: number | null;
  status: ReagentStatus;
}

const EXPIRING_SOON_MS = 14 * 24 * 3600 * 1000;

function templateOf(templateUuid: string): MaterialsV1Template | undefined {
  return (templates.value ?? []).find((item) => item.template_uuid === templateUuid);
}

function templateLabel(templateUuid: string): string {
  const template = templateOf(templateUuid);
  return template ? template.display_name || template.name : templateUuid.slice(0, 8);
}

const reagentRows = computed<ReagentStockRow[]>(() => {
  const now = Date.now();
  const groups = new Map<string, MaterialsV1InventoryLot[]>();
  for (const lot of lots.value) {
    (groups.get(lot.template_uuid) ?? groups.set(lot.template_uuid, []).get(lot.template_uuid)!).push(lot);
  }
  const rows = [...groups.entries()].map(([templateUuid, rowLots]) => {
    const template = templateOf(templateUuid);
    const usable = rowLots.filter((lot) => !lot.quarantined && !(lot.expiry_at_ms && lot.expiry_at_ms <= now));
    const total = rowLots.reduce((sum, lot) => sum + lot.quantity_total, 0);
    const available = usable.reduce((sum, lot) => sum + lot.quantity_available, 0);
    const reserved = rowLots.reduce((sum, lot) => sum + lot.quantity_reserved, 0);
    const expiredCount = rowLots.filter((lot) => lot.expiry_at_ms && lot.expiry_at_ms <= now).length;
    const expiries = usable.map((lot) => lot.expiry_at_ms ?? 0).filter((value) => value > 0);
    const status: ReagentStatus =
      available <= 0 ? (expiredCount && !usable.length ? "expired" : "empty") : total > 0 && available < total * 0.2 ? "low" : "ok";
    return {
      template_uuid: templateUuid,
      name: template ? template.display_name || template.name : templateUuid.slice(0, 8),
      className: template?.name ?? "",
      resourceType: template?.resource_type ?? "",
      unit: rowLots[0]?.unit ?? "",
      total,
      available,
      reserved,
      lots: [...rowLots].sort((a, b) => (a.expiry_at_ms ?? Infinity) - (b.expiry_at_ms ?? Infinity)),
      quarantinedCount: rowLots.filter((lot) => lot.quarantined).length,
      expiredCount,
      nearestExpiry: expiries.length ? Math.min(...expiries) : null,
      status,
    };
  });
  const severity: Record<ReagentStatus, number> = { expired: 0, empty: 1, low: 2, ok: 3 };
  return rows.sort((a, b) => severity[a.status] - severity[b.status] || a.name.localeCompare(b.name));
});

const REAGENT_STATUS_META: Record<ReagentStatus, { label: string; color: string }> = {
  ok: { label: "充足", color: "#0b7a55" },
  low: { label: "偏低", color: "#b45309" },
  empty: { label: "缺货", color: "#b91c1c" },
  expired: { label: "已过期", color: "#b91c1c" },
};

const reagentAlerts = computed(() => reagentRows.value.filter((row) => row.status !== "ok").length);

// ── 批次入库：先选注册表物料类型，再登记批次 ────────────────────

const lotOpen = ref(false);
const lotStep = ref<1 | 2>(1);
const lotSubmitting = ref(false);
const lotQuery = ref("");
const lotTemplate = ref<MaterialsV1Template | null>(null);
const lotMode = ref<"new" | "topup">("new");
const lotForm = ref({ lot_uuid: null as string | null, batch_no: "", unit: "", quantity: 100, expiry_at_ms: null as number | null });

/**
 * 入库形态是「实例 / 计量」两种账目，不是「耗材 / 试剂」：
 * instance = 按件实例化（板、枪头盒、试剂瓶等有 uuid、可追踪、可放到位点的个体，进入「在库物料」）；
 * quantity = 按量登记批次（散装试剂、散装耗材等只记数量 / 单位 / 有效期，供工作流预留与扣减）。
 * 试剂和耗材都可能落在任一边。
 */
const inboundKind = ref<"instance" | "quantity">("instance");

const QUANTITY_FIRST_TYPES = new Set(["reagent", "substance", "chemical", "solvent", "consumable", "liquid", "powder"]);

/** 按类型给默认形态：已有计量库存或属于散装类 → 计量；有同名可实例化资源类 → 实例；否则计量。 */
function defaultInboundKind(template: MaterialsV1Template): "instance" | "quantity" {
  const hasStock = reagentRows.value.some((row) => row.template_uuid === template.template_uuid);
  if (hasStock) return "quantity";
  if (QUANTITY_FIRST_TYPES.has(template.resource_type) || template.category.some((item) => QUANTITY_FIRST_TYPES.has(item))) {
    return "quantity";
  }
  return instantiableClass(template) ? "instance" : "quantity";
}

/** 可入库的物料类型：注册表模板里除设备外的全部（容器、耗材、试剂等）。 */
const lotTemplateChoices = computed(() => {
  const keyword = lotQuery.value.trim().toLowerCase();
  return (templates.value ?? [])
    .filter((item) => item.resource_type !== "device" && item.status === "active")
    .filter(
      (item) =>
        !keyword ||
        [item.name, item.display_name ?? "", item.resource_type, ...item.category].join(" ").toLowerCase().includes(keyword),
    )
    .sort((a, b) => {
      // 已有库存的类型排前面，其余按名称
      const stockA = reagentRows.value.some((row) => row.template_uuid === a.template_uuid) ? 0 : 1;
      const stockB = reagentRows.value.some((row) => row.template_uuid === b.template_uuid) ? 0 : 1;
      return stockA - stockB || (a.display_name || a.name).localeCompare(b.display_name || b.name);
    });
});

const lotTemplateStock = computed(() =>
  lotTemplate.value ? reagentRows.value.find((row) => row.template_uuid === lotTemplate.value!.template_uuid) ?? null : null,
);

const topupOptions = computed(() =>
  (lotTemplateStock.value?.lots ?? [])
    .filter((lot) => !lot.quarantined)
    .map((lot) => ({
      label: `${lot.batch_no || lot.lot_uuid.slice(0, 8)} · 可用 ${lot.quantity_available} ${lot.unit}${lot.expiry_at_ms ? ` · 到期 ${fmtDate(lot.expiry_at_ms)}` : ""}`,
      value: lot.lot_uuid,
    })),
);

function fmtDate(value?: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("zh-CN");
}

function openLot(template?: MaterialsV1Template) {
  lotQuery.value = "";
  lotMode.value = "new";
  lotForm.value = { lot_uuid: null, batch_no: "", unit: "", quantity: 100, expiry_at_ms: null };
  instantiateForm.value = { name: "", barcode: "", quantity: 1 };
  lotTemplate.value = template ?? null;
  lotStep.value = template ? 2 : 1;
  if (template) prefillLotForm(template);
  lotOpen.value = true;
  void ensureTemplates();
  void ensureRegistryClasses();
}

function prefillLotForm(template: MaterialsV1Template) {
  const stock = reagentRows.value.find((row) => row.template_uuid === template.template_uuid);
  lotForm.value.unit = stock?.unit ?? lotForm.value.unit;
  inboundKind.value = defaultInboundKind(template);
  // 实例名默认就带序号，不让人猜"自动生成"会长什么样
  if (!instantiateForm.value.name.trim()) instantiateForm.value.name = suggestInstanceName(template);
}

async function chooseLotTemplate(template: MaterialsV1Template) {
  lotTemplate.value = template;
  lotStep.value = 2;
  // 默认形态依赖 registry-classes（判断能否实例化），确保已载入再判定
  await ensureRegistryClasses();
  // ref 里存的是响应式代理，按 uuid 比较而不是引用
  if (lotTemplate.value?.template_uuid === template.template_uuid) prefillLotForm(template);
}

function openTopup(row: ReagentStockRow) {
  const template = templateOf(row.template_uuid);
  if (!template) {
    message.warning("模板目录尚未载入，请稍后再试");
    void ensureTemplates();
    return;
  }
  openLot(template);
  inboundKind.value = "quantity";
  lotMode.value = "topup";
  lotForm.value.lot_uuid = row.lots.find((lot) => !lot.quarantined)?.lot_uuid ?? null;
}

/** 在库（未上台）的独立物料：根层非设备。 */
const warehouseItems = computed(() => roots.value.filter((item) => item.material.resource_type !== "device"));

/** 当前选中项能否「出库到位点」：在库根层物料，或已在台面上的可移动物料。 */
const canIssue = computed(() => !!selected.value && selected.value.material.resource_type !== "device");

watch(lotMode, (mode) => {
  if (mode === "topup") {
    lotForm.value.lot_uuid ??= topupOptions.value[0]?.value ?? null;
  } else {
    lotForm.value.lot_uuid = null;
  }
});

watch(
  () => lotForm.value.lot_uuid,
  (lotUuid) => {
    const lot = lotUuid ? lots.value.find((item) => item.lot_uuid === lotUuid) : null;
    if (lot) lotForm.value.unit = lot.unit;
  },
);

async function submitLot() {
  const template = lotTemplate.value;
  if (!template) {
    message.warning("请先选择物料类型");
    return;
  }
  if (lotMode.value === "topup" && !lotForm.value.lot_uuid) {
    message.warning("请选择要补充的批次");
    return;
  }
  const unit = lotForm.value.unit.trim();
  if (!unit) {
    message.warning("请填写计量单位（如 mL、g、个）");
    return;
  }
  if (!(lotForm.value.quantity > 0)) {
    message.warning("数量必须大于 0");
    return;
  }
  lotSubmitting.value = true;
  try {
    await conn.api.domains.materialsV1.inboundLot({
      template_uuid: template.template_uuid,
      lot_uuid: lotMode.value === "topup" ? lotForm.value.lot_uuid : null,
      batch_no: lotForm.value.batch_no.trim(),
      unit,
      quantity: lotForm.value.quantity,
      expiry_at_ms: lotForm.value.expiry_at_ms ?? null,
    });
    message.success(lotMode.value === "topup" ? "批次已补充" : `${template.display_name || template.name} 已入库`);
    lotOpen.value = false;
    bottomTab.value = "reagents";
    await refresh();
  } catch (error) {
    message.error(`入库失败：${describeError(error)}`);
  } finally {
    lotSubmitting.value = false;
  }
}

// ── 表格列 ─────────────────────────────────────────────────────

function fmtMs(value?: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

const siteColumns: DataTableColumns<MaterialsV1Site> = [
  { title: "位点", key: "label", width: 90 },
  { title: "序号", key: "site_index", width: 70 },
  {
    title: "占用",
    key: "occupied_material_uuid",
    render: (row) =>
      row.occupied_material_uuid
        ? h(
            "a",
            { class: "link", onClick: () => (selectedUuid.value = row.occupied_material_uuid!) },
            byUuid.value.get(row.occupied_material_uuid) ? displayName(byUuid.value.get(row.occupied_material_uuid)!) : row.occupied_material_uuid,
          )
        : h("span", { class: "dim" }, "空"),
  },
  {
    title: "允许类别",
    key: "allowed_resource_categories",
    render: (row) => row.allowed_resource_categories.join(", ") || "—",
  },
];

const lotColumns: DataTableColumns<MaterialsV1InventoryLot> = [
  {
    title: "物料类型",
    key: "template_uuid",
    width: 200,
    ellipsis: { tooltip: true },
    render: (row) => h("span", { title: row.template_uuid }, templateLabel(row.template_uuid)),
  },
  { title: "批次号", key: "batch_no", width: 130, render: (row) => row.batch_no || h("span", { class: "dim" }, "—") },
  { title: "可用", key: "quantity_available", width: 110, render: (row) => `${row.quantity_available} ${row.unit}` },
  { title: "预留", key: "quantity_reserved", width: 110, render: (row) => `${row.quantity_reserved} ${row.unit}` },
  { title: "总量", key: "quantity_total", width: 110, render: (row) => `${row.quantity_total} ${row.unit}` },
  {
    title: "有效期",
    key: "expiry_at_ms",
    width: 130,
    render: (row) => {
      if (!row.expiry_at_ms) return h("span", { class: "dim" }, "—");
      const expired = row.expiry_at_ms <= Date.now();
      const soon = !expired && row.expiry_at_ms - Date.now() < EXPIRING_SOON_MS;
      return h("span", { class: expired ? "err" : soon ? "warn" : undefined }, `${fmtDate(row.expiry_at_ms)}${expired ? " 已过期" : soon ? " 即将到期" : ""}`);
    },
  },
  { title: "隔离", key: "quarantined", width: 70, render: (row) => (row.quarantined ? h("span", { class: "err" }, "隔离") : "否") },
  { title: "批次 UUID", key: "lot_uuid", width: 110, render: (row) => h("span", { class: "mono dim" }, row.lot_uuid.slice(0, 8)) },
];

const reagentColumns: DataTableColumns<ReagentStockRow> = [
  {
    title: "物料类型",
    key: "name",
    minWidth: 200,
    render: (row) =>
      h("div", { class: "reagent-name" }, [
        h("span", { class: "reagent-title" }, row.name),
        h("span", { class: "mono dim small" }, [row.className, row.resourceType ? ` · ${row.resourceType}` : ""].join("")),
      ]),
  },
  {
    title: "状态",
    key: "status",
    width: 100,
    render: (row) =>
      h(StatusPill, { status: row.status, size: "small", label: REAGENT_STATUS_META[row.status].label }),
  },
  {
    title: "可用",
    key: "available",
    width: 130,
    render: (row) => h("b", { style: `color:${REAGENT_STATUS_META[row.status].color}` }, `${row.available} ${row.unit}`),
  },
  { title: "预留", key: "reserved", width: 110, render: (row) => `${row.reserved} ${row.unit}` },
  { title: "总量", key: "total", width: 110, render: (row) => `${row.total} ${row.unit}` },
  {
    title: "批次",
    key: "lots",
    width: 150,
    render: (row) => {
      const parts = [`${row.lots.length} 批`];
      if (row.quarantinedCount) parts.push(`隔离 ${row.quarantinedCount}`);
      if (row.expiredCount) parts.push(`过期 ${row.expiredCount}`);
      return h("span", { class: row.quarantinedCount || row.expiredCount ? "warn" : undefined }, parts.join(" · "));
    },
  },
  {
    title: "最近到期",
    key: "nearestExpiry",
    width: 130,
    render: (row) => {
      if (!row.nearestExpiry) return h("span", { class: "dim" }, "—");
      const soon = row.nearestExpiry - Date.now() < EXPIRING_SOON_MS;
      return h("span", { class: soon ? "warn" : undefined }, fmtDate(row.nearestExpiry));
    },
  },
  {
    title: "",
    key: "actions",
    width: 90,
    render: (row) =>
      h(
        NButton,
        { size: "tiny", secondary: true, disabled: !conn.online, onClick: () => openTopup(row) },
        { default: () => "补充入库" },
      ),
  },
];

const reservationColumns: DataTableColumns<MaterialsV1InventoryReservation> = [
  {
    title: "任务",
    key: "task_uuid",
    width: 150,
    render: (row) =>
      h("a", { class: "link mono", onClick: () => router.push(`/workflow-tasks/${encodeURIComponent(row.task_uuid)}`) }, row.task_uuid.slice(0, 8)),
  },
  { title: "作业", key: "job_uuid", width: 120, render: (row) => h("span", { class: "mono" }, row.job_uuid.slice(0, 8)) },
  { title: "状态", key: "status", width: 110, render: (row) => h(StatusPill, { status: row.status, size: "small" }) },
  { title: "需求项", key: "items", width: 90, render: (row) => row.items.length },
  { title: "创建", key: "created_at_ms", width: 170, render: (row) => fmtMs(row.created_at_ms) },
  { title: "过期", key: "expires_at_ms", width: 170, render: (row) => fmtMs(row.expires_at_ms) },
];

const OPERATION_LABELS: Record<string, string> = {
  create: "创建",
  create_material_tree: "创建树",
  instantiate_material: "实例入库",
  move_material: "移动",
  transfer_material: "转运",
  patch_material: "更新标识",
  put_material_data: "写入内容",
  put_material_position: "写入位置",
  delete_material: "删除",
  put_template: "模板",
  delete_template: "删模板",
  inbound_inventory_lot: "批次入库",
};

const changeColumns: DataTableColumns<MaterialsV1Change> = [
  { title: "序号", key: "sequence", width: 80 },
  { title: "时间", key: "occurred_at_ms", width: 170, render: (row) => fmtMs(row.occurred_at_ms) },
  { title: "类型", key: "aggregate_type", width: 120 },
  { title: "对象", key: "aggregate_uuid", width: 170, render: (row) => h(EntityRef, { uuid: row.aggregate_uuid }) },
  { title: "操作", key: "operation", width: 110, render: (row) => OPERATION_LABELS[row.operation] ?? row.operation },
  { title: "版本", key: "aggregate_version", width: 70 },
  {
    title: "来源",
    key: "actor_type",
    width: 110,
    render: (row) => h("span", { title: row.actor_type }, actorTypeLabel(row.actor_type)),
  },
];

const templateColumns: DataTableColumns<MaterialsV1Template> = [
  { title: "名称", key: "display_name", minWidth: 180, ellipsis: { tooltip: true }, render: (row) => row.display_name ?? row.name },
  { title: "类名", key: "name", minWidth: 160, ellipsis: { tooltip: true }, render: (row) => h("span", { class: "mono" }, row.name) },
  { title: "类型", key: "resource_type", width: 110 },
  {
    title: "分类",
    key: "category",
    render: (row) => h(NSpace, { size: 4 }, { default: () => row.category.map((item) => h(NTag, { size: "small", bordered: false }, { default: () => item })) }),
  },
  { title: "位点", key: "available_sites", width: 70, render: (row) => row.available_sites.length },
  { title: "版本", key: "template_version", width: 90 },
];

const selectedSite = computed(() => (selected.value ? siteOf(selected.value.material.material_uuid) : null));
const selectedDevice = computed(() => rootDeviceOf(selected.value));
</script>

<template>
  <div class="page">
    <PageHeader
      :title="domain.config.nav.inventory"
      :subtitle="`${counts.devices} 台设备 · ${counts.materials} 件物料（在库 ${warehouseItems.length} 件）· ${counts.occupied}/${counts.sites} 个位点已占用 · ${reagentRows.length} 种计量库存`"
    >
      <template #actions>
        <NButton size="small" type="primary" :disabled="!conn.online" @click="openLot()">
          <template #icon><NIcon><AddOutline /></NIcon></template>
          入库
        </NButton>
        <NButton
          size="small"
          :disabled="!conn.online || !canIssue"
          :title="canIssue ? '把选中物料放到设备位点上' : '先在物料树里选中一件在库物料'"
          @click="openMove"
        >
          <template #icon><NIcon><SwapHorizontalOutline /></NIcon></template>
          出库到位点
        </NButton>
        <NButton size="small" :loading="loading" @click="refresh">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <NAlert v-if="!conn.online" type="info">尚未连接后端，物料权威不可读。</NAlert>
    <NAlert v-else-if="lastError" type="warning">物料读取失败：{{ lastError }}</NAlert>

    <div class="workbench">
      <NCard size="small" class="tree-card" content-style="padding: 10px 8px 12px">
        <template #header>物料树</template>
        <template #header-extra>
          <NInput v-model:value="filter" size="tiny" clearable placeholder="搜索名称 / 类名 / 条码" style="width: 200px" />
        </template>
        <NEmpty
          v-if="loaded && !roots.length"
          description="权威中还没有物料：Host 启动上传设备图后设备会作为根物料出现"
          style="padding: 40px 0"
        />
        <NTree
          v-else
          v-model:expanded-keys="expandedKeys"
          :data="treeData"
          :selected-keys="selectedUuid ? [selectedUuid] : []"
          block-line
          selectable
          @update:selected-keys="(keys: Array<string | number>) => { const key = String(keys[0] ?? ''); if (key !== WAREHOUSE_KEY) selectedUuid = key; }"
        />
      </NCard>

      <NCard size="small" class="detail-card">
        <template #header>{{ selected ? displayName(selected) : "物料详情" }}</template>
        <template v-if="selected" #header-extra>
          <NSpace size="small">
            <NButton size="tiny" @click="openEdit">编辑</NButton>
            <NButton size="tiny" :disabled="selected.material.resource_type === 'device'" @click="openMove">
              <template #icon><NIcon><SwapHorizontalOutline /></NIcon></template>
              {{ selected.material.parent_material_uuid ? "移动 / 转运" : "出库到位点" }}
            </NButton>
            <NPopconfirm :disabled="selected.material.resource_type === 'device'" @positive-click="submitDelete">
              <template #trigger>
                <NButton size="tiny" type="error" secondary :loading="deleting" :disabled="selected.material.resource_type === 'device'">
                  <template #icon><NIcon><TrashOutline /></NIcon></template>
                  删除
                </NButton>
              </template>
              递归删除该物料及其子节点，并释放占用的位点。确认？
            </NPopconfirm>
          </NSpace>
        </template>

        <NEmpty v-if="!selected" description="在左侧选择一个物料查看标识、位点与内容物" style="padding: 48px 0" />
        <template v-else>
          <div class="kv-grid">
            <div class="kv"><span class="k">类型</span><span class="v">{{ selected.material.resource_type }}</span></div>
            <div class="kv"><span class="k">registry 类</span><span class="v mono">{{ selected.material.class_name }}</span></div>
            <div class="kv"><span class="k">resource_id</span><span class="v mono">{{ selected.material.resource_id }}</span></div>
            <div class="kv"><span class="k">生命周期</span><span class="v"><StatusPill :status="selected.material.lifecycle_status" size="small" /></span></div>
            <div class="kv"><span class="k">条码</span><span class="v mono">{{ selected.material.barcode || "—" }}</span></div>
            <div class="kv"><span class="k">机器</span><span class="v">{{ selected.material.machine_name || "—" }}</span></div>
            <div class="kv">
              <span class="k">所属设备</span>
              <span class="v">
                <a v-if="selectedDevice && selectedDevice.material.material_uuid !== selected.material.material_uuid" class="link" @click="selectedUuid = selectedDevice.material.material_uuid">{{ displayName(selectedDevice) }}</a>
                <span v-else>{{ selectedDevice ? "本身" : "—" }}</span>
              </span>
            </div>
            <div class="kv">
              <span class="k">当前位点</span>
              <span class="v">
                <template v-if="selectedSite">
                  <a class="link" @click="selectedUuid = selectedSite.owner.material.material_uuid">{{ displayName(selectedSite.owner) }}</a>
                  · {{ selectedSite.site.label }}
                </template>
                <span v-else class="dim">未放置在位点</span>
              </span>
            </div>
            <div class="kv"><span class="k">位置</span><span class="v mono">{{ selected.position.position_x ?? "—" }}, {{ selected.position.position_y ?? "—" }}, {{ selected.position.position_z ?? "—" }}</span></div>
            <div class="kv"><span class="k">尺寸</span><span class="v mono">{{ selected.position.size_width }} × {{ selected.position.size_height }} × {{ selected.position.size_depth }}</span></div>
            <div class="kv"><span class="k">UUID</span><span class="v mono">{{ selected.material.material_uuid }}</span></div>
            <div class="kv"><span class="k">版本</span><span class="v">v{{ selected.material.version }} · 内容 v{{ selected.data.content_version }}</span></div>
          </div>
          <p v-if="selected.material.description" class="desc">{{ selected.material.description }}</p>

          <div class="section-title">位点（{{ selected.sites.length }}）</div>
          <NDataTable
            v-if="selected.sites.length"
            :columns="siteColumns"
            :data="selected.sites"
            size="small"
            :row-key="(row: MaterialsV1Site) => row.site_uuid"
            :max-height="260"
          />
          <p v-else class="dim small">该物料没有声明位点。</p>

          <div class="section-title">内容物（{{ selected.data.substances.length }}）</div>
          <div v-if="selected.data.substances.length" class="substances">
            <div v-for="substance in selected.data.substances" :key="substance.substance_uuid ?? substance.name" class="substance">
              <span class="substance-name">{{ substance.name }}</span>
              <span class="substance-qty mono">{{ substance.quantity }} {{ substance.quantity_unit }}</span>
              <NTag size="tiny" :bordered="false">{{ substance.physical_state }}</NTag>
            </div>
          </div>
          <p v-else class="dim small">无内容物记录。</p>

          <div class="section-title">子物料（{{ (childrenOf.get(selected.material.material_uuid) ?? []).length }}）</div>
          <div v-if="(childrenOf.get(selected.material.material_uuid) ?? []).length" class="children">
            <a
              v-for="child in childrenOf.get(selected.material.material_uuid)"
              :key="child.material.material_uuid"
              class="child-chip"
              @click="selectedUuid = child.material.material_uuid"
            >
              <NIcon size="12"><ArrowRedoOutline /></NIcon>
              {{ displayName(child) }}
              <small>{{ child.material.resource_type }}</small>
            </a>
          </div>
          <p v-else class="dim small">没有子物料。</p>
        </template>
      </NCard>
    </div>

    <NCard size="small" content-style="padding-top: 4px">
      <NTabs v-model:value="bottomTab" type="line" size="small">
        <NTabPane name="reagents">
          <template #tab>
            <span>计量库存（{{ reagentRows.length }}）</span>
            <span v-if="reagentAlerts" class="tab-alert" :title="`${reagentAlerts} 种计量库存缺货 / 偏低 / 过期`">{{ reagentAlerts }}</span>
          </template>
          <div v-if="!reagentRows.length" class="reagent-empty">
            <span class="empty-title">还没有按量登记的库存</span>
            <span class="dim">按数量管理的散装试剂、耗材记在这里：先从注册表选一种物料类型，再登记批次数量、单位与有效期；工作流的计量需求会从这里预留和扣减。按件追踪的物料（板、枪头盒、试剂瓶等）请用「入库 → 按件登记」，它们出现在上方「在库物料」。</span>
            <NButton size="small" type="primary" :disabled="!conn.online" @click="openLot()">登记第一批计量库存</NButton>
          </div>
          <template v-else>
            <div class="reagent-toolbar">
              <span class="dim small">按注册表模板聚合；可用量已排除隔离与过期批次。</span>
              <NButton size="small" :disabled="!conn.online" @click="openLot()">入库新类型</NButton>
            </div>
            <NDataTable :columns="reagentColumns" :data="reagentRows" size="small" :scroll-x="980" :row-key="(row: ReagentStockRow) => row.template_uuid" />
          </template>
        </NTabPane>
        <NTabPane name="lots" :tab="`库存批次（${lots.length}）`">
          <NEmpty v-if="!lots.length" description="没有计量库存批次；可通过「入库 → 按量登记」登记" style="padding: 32px 0" />
          <NDataTable v-else :columns="lotColumns" :data="lots" size="small" :scroll-x="1000" :row-key="(row: MaterialsV1InventoryLot) => row.lot_uuid" />
        </NTabPane>
        <NTabPane name="reservations" :tab="`预留（${reservations.length}）`">
          <NEmpty v-if="!reservations.length" description="调度器尚未为任何作业预留库存" style="padding: 32px 0" />
          <NDataTable v-else :columns="reservationColumns" :data="reservations" size="small" :scroll-x="820" :row-key="(row: MaterialsV1InventoryReservation) => row.reservation_uuid" />
        </NTabPane>
        <NTabPane name="changes" :tab="`变更账本（${changes.length}）`">
          <NDataTable :columns="changeColumns" :data="changes" size="small" :scroll-x="820" :max-height="360" :row-key="(row: MaterialsV1Change) => row.sequence" />
        </NTabPane>
        <NTabPane name="templates" :tab="templates ? `模板目录（${templates.length}）` : '模板目录'">
          <NDataTable
            :columns="templateColumns"
            :data="templates ?? []"
            :loading="templatesLoading"
            size="small"
            :scroll-x="820"
            :max-height="420"
            :row-key="(row: MaterialsV1Template) => row.template_uuid"
          />
        </NTabPane>
      </NTabs>
    </NCard>

    <!-- 出库到位点 / 移动 / 转运 -->
    <NModal v-model:show="moveOpen" preset="card" :title="selected && !selected.material.parent_material_uuid ? '出库到位点' : '移动到位点'" style="width: 480px">
      <NForm label-placement="top" size="small">
        <NFormItem label="目标位点（仅列出空位）">
          <NSelect v-model:value="moveSiteUuid" filterable :options="vacantSiteOptions" placeholder="选择设备 · 位点" />
        </NFormItem>
      </NForm>
      <p class="dim small">同一设备内换位走 move；跨设备自动走 transfer，由后端驱动两端设备同步后返回。</p>
      <NSpace justify="end">
        <NButton @click="moveOpen = false">取消</NButton>
        <NButton type="primary" :loading="moving" :disabled="!moveSiteUuid" @click="submitMove">确认</NButton>
      </NSpace>
    </NModal>

    <!-- 编辑标识 -->
    <NModal v-model:show="editOpen" preset="card" title="编辑物料标识" style="width: 480px">
      <NForm label-placement="top" size="small">
        <NFormItem label="展示名"><NInput v-model:value="editForm.display_name" /></NFormItem>
        <NFormItem label="条码"><NInput v-model:value="editForm.barcode" /></NFormItem>
        <NFormItem label="描述"><NInput v-model:value="editForm.description" type="textarea" :rows="2" /></NFormItem>
        <NFormItem label="生命周期">
          <NSelect v-model:value="editForm.lifecycle_status" :options="LIFECYCLE_OPTIONS.map((value) => ({ label: value, value }))" />
        </NFormItem>
      </NForm>
      <NSpace justify="end">
        <NButton @click="editOpen = false">取消</NButton>
        <NButton type="primary" :loading="editing" @click="submitEdit">保存</NButton>
      </NSpace>
    </NModal>

    <!-- 批次入库：第一步选注册表物料类型，第二步登记批次 -->
    <NModal v-model:show="lotOpen" preset="card" :title="lotStep === 1 ? '入库 · 1/2 选择注册表物料类型' : '入库 · 2/2 登记'" style="width: 560px">
      <template v-if="lotStep === 1">
        <NInput v-model:value="lotQuery" size="small" clearable placeholder="搜索名称 / 类名 / 类型 / 分类" autofocus />
        <div v-if="templatesLoading" class="dim small" style="padding: 24px 0; text-align: center">正在读取注册表模板目录…</div>
        <NEmpty v-else-if="!lotTemplateChoices.length" description="注册表里没有可入库的物料类型" style="padding: 24px 0" />
        <div v-else class="type-list">
          <button
            v-for="item in lotTemplateChoices"
            :key="item.template_uuid"
            type="button"
            class="type-row"
            @click="chooseLotTemplate(item)"
          >
            <span class="type-main">
              <span class="type-name">{{ item.display_name || item.name }}</span>
              <span class="mono dim small">{{ item.name }} · v{{ item.template_version }}</span>
            </span>
            <span class="type-meta">
              <NTag size="tiny" :bordered="false">{{ item.resource_type }}</NTag>
              <NTag v-for="cat in item.category.slice(0, 2)" :key="cat" size="tiny" :bordered="false" type="info">{{ cat }}</NTag>
              <span v-if="reagentRows.find((row) => row.template_uuid === item.template_uuid)" class="type-stock">
                在库 {{ reagentRows.find((row) => row.template_uuid === item.template_uuid)!.available }}
                {{ reagentRows.find((row) => row.template_uuid === item.template_uuid)!.unit }}
              </span>
            </span>
          </button>
        </div>
        <p class="dim small" style="margin: 10px 0 0">列表来自 Host 已加载的注册表（设备类型不可入库）；新的物料类型需先在注册表中定义。</p>
      </template>

      <template v-else-if="lotTemplate">
        <div class="type-picked">
          <span class="type-name">{{ lotTemplate.display_name || lotTemplate.name }}</span>
          <span class="mono dim small">{{ lotTemplate.name }} · {{ lotTemplate.resource_type }}</span>
          <NButton size="tiny" quaternary @click="lotStep = 1">更换类型</NButton>
        </div>

        <!-- 入库形态：按件（可追踪实例）还是按量（计量批次）；试剂和耗材都可能是任一种 -->
        <div class="kind-switch">
          <button
            type="button"
            class="kind-card"
            :class="{ on: inboundKind === 'instance', off: !instantiableClass(lotTemplate) }"
            :disabled="!instantiableClass(lotTemplate)"
            @click="inboundKind = 'instance'"
          >
            <b>按件登记（可追踪实例）</b>
            <span>{{ instantiableClass(lotTemplate) ? "板、枪头盒、试剂瓶等：每件一个 uuid / 条码，进入「在库物料」，之后出库到设备位点" : "注册表里没有同名可实例化资源类" }}</span>
          </button>
          <button type="button" class="kind-card" :class="{ on: inboundKind === 'quantity' }" @click="inboundKind = 'quantity'">
            <b>按量登记（计量批次）</b>
            <span>散装试剂、散装耗材等：只记可用量、单位、有效期；工作流的计量需求从这里预留与扣减</span>
          </button>
        </div>

        <NForm v-if="inboundKind === 'instance'" label-placement="top" size="small" style="margin-top: 10px">
          <div class="form-row">
            <NFormItem label="实例名（末尾序号会按件数顺延）" style="flex: 2">
              <NInput v-model:value="instantiateForm.name" placeholder="例如 demo_tips_24_01" />
            </NFormItem>
            <NFormItem label="件数" style="flex: 1">
              <NInputNumber v-model:value="instantiateForm.quantity" :min="1" :max="50" style="width: 100%" />
            </NFormItem>
          </div>
          <NFormItem label="条码（仅 1 件时；多件请入库后用扫码工作台连续绑定）">
            <NInput v-model:value="instantiateForm.barcode" :disabled="instantiateForm.quantity !== 1" placeholder="可选，扫码枪直接扫" />
          </NFormItem>
          <p class="dim small names-preview">
            将创建：<span class="mono">{{ plannedNamesPreview }}</span>
          </p>
        </NForm>
        <NSpace v-if="inboundKind === 'instance'" justify="end">
          <NButton @click="lotOpen = false">取消</NButton>
          <NButton type="primary" :loading="instantiating" @click="submitInstantiate">入库</NButton>
        </NSpace>

        <NForm v-if="inboundKind === 'quantity'" label-placement="top" size="small" style="margin-top: 10px">
          <NFormItem v-if="topupOptions.length" label="批次">
            <NRadioGroup v-model:value="lotMode" size="small">
              <NRadioButton value="new">新建批次</NRadioButton>
              <NRadioButton value="topup">补充已有批次</NRadioButton>
            </NRadioGroup>
          </NFormItem>
          <NFormItem v-if="lotMode === 'topup'" label="要补充的批次">
            <NSelect v-model:value="lotForm.lot_uuid" :options="topupOptions" placeholder="选择批次" />
          </NFormItem>
          <NFormItem v-else label="批次号（供应商批号 / 自编号，可选）">
            <NInput v-model:value="lotForm.batch_no" placeholder="例如 LOT-2026-0902-01" />
          </NFormItem>
          <div class="form-row">
            <NFormItem label="数量" style="flex: 1">
              <NInputNumber v-model:value="lotForm.quantity" :min="0" style="width: 100%" />
            </NFormItem>
            <NFormItem label="单位" style="flex: 1">
              <NInput v-model:value="lotForm.unit" :disabled="lotMode === 'topup'" placeholder="mL / g / 个" />
            </NFormItem>
          </div>
          <NFormItem v-if="lotMode === 'new'" label="有效期（可选）">
            <NDatePicker v-model:value="lotForm.expiry_at_ms" type="date" clearable style="width: 100%" />
          </NFormItem>
        </NForm>
        <template v-if="inboundKind === 'quantity'">
          <p v-if="lotTemplateStock" class="dim small">
            该类型当前在库 {{ lotTemplateStock.available }} {{ lotTemplateStock.unit }}（{{ lotTemplateStock.lots.length }} 批）；同一类型的单位应保持一致。
          </p>
          <NSpace justify="end">
            <NButton @click="lotOpen = false">取消</NButton>
            <NButton type="primary" :loading="lotSubmitting" @click="submitLot">{{ lotMode === "topup" ? "补充" : "入库" }}</NButton>
          </NSpace>
        </template>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workbench {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr);
  gap: 12px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .workbench {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tree-card,
.detail-card {
  min-height: 460px;
}

.tree-card :deep(.n-card__content) {
  max-height: 620px;
  overflow: auto;
}

.tree-card :deep(.n-tree-node-content) {
  font-size: 13px;
}

.tree-meta {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #8b929c;
  margin-left: 8px;
}

.kv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 18px;
}

.kv {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  min-width: 0;
}

.kv .k {
  flex-shrink: 0;
  width: 84px;
  color: #8b929c;
}

.kv .v {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #101418;
}

.mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.dim {
  color: #8b929c;
}

.small {
  font-size: 12px;
  margin: 4px 0 0;
}

.desc {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: #3d4650;
}

.section-title {
  margin: 18px 0 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
}

.substances {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.substance {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  font-size: 12.5px;
}

.substance-name {
  flex: 1;
  font-weight: 600;
}

.children {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.child-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--hairline);
  background: var(--panel-soft);
  font-size: 12px;
  cursor: pointer;
}

.child-chip small {
  color: #8b929c;
}

.child-chip:hover {
  border-color: var(--domain-accent);
  color: var(--domain-accent);
}

.link {
  color: var(--domain-accent);
  cursor: pointer;
}

.form-row {
  display: flex;
  gap: 12px;
}

/* ── 计量库存 ── */
.tab-alert {
  display: inline-flex;
  min-width: 16px;
  height: 16px;
  margin-left: 6px;
  padding: 0 5px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #b91c1c;
  color: #fff;
  font: 700 10px var(--font-mono);
}

.reagent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0 24px;
  text-align: center;
  max-width: 520px;
  margin: 0 auto;
}

.reagent-empty .empty-title {
  font-weight: 700;
  color: #3d4650;
}

.reagent-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0 8px;
}

:deep(.reagent-name) {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

:deep(.reagent-title) {
  font-weight: 600;
}

:deep(.warn) {
  color: #b45309;
}

:deep(.err) {
  color: #b91c1c;
}

/* ── 入库：类型选择列表 ── */
.type-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 380px;
  overflow: auto;
  margin-top: 10px;
}

.type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.type-row:hover {
  border-color: var(--domain-accent);
  background: var(--domain-accent-soft);
}

.type-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.type-name {
  font-weight: 600;
  color: #101418;
}

.type-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.type-stock {
  font-size: 11px;
  color: #0b7a55;
  font-weight: 600;
  margin-left: 4px;
}

.type-picked {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--panel-soft);
}

/* 入库形态卡：按件 / 按数量 */
.kind-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}

.kind-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  color: #5c6874;
  line-height: 1.45;
}

.kind-card b {
  color: #101418;
  font-size: 13px;
}

.kind-card.on {
  border-color: var(--domain-accent);
  background: var(--domain-accent-soft);
}

.kind-card.off {
  opacity: 0.55;
  cursor: not-allowed;
}

.names-preview {
  margin: -4px 0 8px;
}
</style>
