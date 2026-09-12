/**
 * 动作参数表单核心（EditorView 节点浮层与 DevicesView 单点动作同源复用）：
 *
 * - schema 识别：runtime.v1 endpoint action capability descriptor → placeholder 字段
 *   （unilabos_* 标记 + legacy Resource msg 结构识别，见 action-placeholders.ts）；
 * - 动态可填项：物料 / 在线设备 / 资源模板 / 人工确认指派人，表单激活时实时
 *   拉取，seq 守卫丢弃过期响应，设备/动作变化 400ms 防抖重识别；
 * - 人工确认指派（unilabos_manual_confirm）：微后端没有用户目录，渲染为 tags
 *   自由输入（可从本机最近使用的指派人补全）；
 * - 置顶聚焦：可选 isFocused 回调（编辑器接变量表）；不传则默认全量展示；
 * - 参数写回统一走 paramJson（提交 payload 形状不变）。
 */
import { computed, ref, watch, type Ref } from "vue";
import {
  actionSchemaDetailFromCapability,
  type DeviceActionSchemaDetail,
  type EdgeApi,
} from "@openlab/protocol";
import {
  detectPlaceholderFields,
  placeholderLabel as placeholderLabelOf,
  resourceRefLabel,
  resourceRefUuid,
  resourceRefValue,
  type PlaceholderField,
  type PlaceholderKind,
} from "./action-placeholders";
import {
  flattenParameterFields,
  parseNodeParam,
  writePath,
  type ParameterField,
} from "./workflow-variables";
import { describeError } from "./errors";

export interface PlaceholderOption {
  label: string;
  value: string;
  /** 出库资源类：展示名（主）与类 id（次），供选项自定义渲染。 */
  displayName?: string;
  registryClass?: string;
}

export interface PlaceholderOptionState {
  loading: boolean;
  error: string;
  options: PlaceholderOption[];
  /** confirm 数据源允许自由输入（tags 模式）；其余 kind 恒 false。 */
  allowFreeInput: boolean;
}

function emptyOptionState(): PlaceholderOptionState {
  return { loading: false, error: "", options: [], allowFreeInput: false };
}

export interface ActionParamFormOptions {
  api: () => EdgeApi;
  device: Ref<string>;
  action: Ref<string>;
  /** 参数 JSON 文本（双向：表单编辑写回这里，提交链路不变）。 */
  paramJson: Ref<string>;
  /** 表单是否活跃（浮层/弹窗打开）；设备/动作变化只在活跃时重识别。 */
  active: () => boolean;
  /** 置顶聚焦回调（编辑器接工作流变量表）；不传则默认展示全部字段。 */
  isFocused?: (path: string) => boolean;
  /** 参数写回后的钩子（编辑器同步节点数据与变量表）。 */
  onParamWritten?: (path: string | null, value: unknown) => void;
  onError?: (message: string) => void;
  /** 成功提示回调（如出库完成的汇总消息）；不传则静默。 */
  onSuccess?: (message: string) => void;
  /** schema 带 goal_default 且当前参数为空对象时预填（设备页单点动作）。 */
  prefillFromGoalDefault?: boolean;
}

/** deduct（物料出库）字段的草稿状态：资源类 + 实例名 + 数量 + 条码 + 出库中标记。 */
export interface DeductDraftState {
  registryClass: string;
  name: string;
  /** 出库数量；>1 时循环实例化并自动加序号后缀。 */
  quantity: number;
  /** 可选条码；仅数量为 1 时生效（多实例共用条码无意义）。 */
  barcode: string;
  busy: boolean;
}

export function useActionParamForm(options: ActionParamFormOptions) {
  const placeholderFields = ref<PlaceholderField[]>([]);
  const actionSchemaHint = ref("");
  const materialOptionState = ref<PlaceholderOptionState>(emptyOptionState());
  const deviceOptionState = ref<PlaceholderOptionState>(emptyOptionState());
  const siteOptionState = ref<PlaceholderOptionState>(emptyOptionState());
  const classOptionState = ref<PlaceholderOptionState>(emptyOptionState());
  const confirmOptionState = ref<PlaceholderOptionState>(emptyOptionState());
  const deductOptionState = ref<PlaceholderOptionState>(emptyOptionState());
  const materialNameByUuid = ref<Map<string, string>>(new Map());
  /** deduct 字段草稿（按参数名），出库成功后写回 {id, uuid} 引用。 */
  const deductDrafts = ref<Record<string, DeductDraftState>>({});
  /** 并发防护：表单快速开关/切动作时丢弃过期响应。 */
  let loadSeq = 0;
  /** 最近一次请求的 device|action，避免打开表单与 watch 对同一动作重复拉取。 */
  let loadKey = "";

  function optionStateFor(kind: PlaceholderKind): PlaceholderOptionState {
    if (kind === "device") return deviceOptionState.value;
    if (kind === "site") return siteOptionState.value;
    if (kind === "class") return classOptionState.value;
    if (kind === "confirm") return confirmOptionState.value;
    if (kind === "deduct") return deductOptionState.value;
    return materialOptionState.value;
  }

  /** 选择器不可用（无数据源或拉取失败）时回退为原始字段输入。 */
  function placeholderUsable(field: PlaceholderField): boolean {
    if (field.kind === "unsupported") return false;
    // confirm 永远可用：数据源失败降级为纯自由输入，而非回退原始字段。
    if (field.kind === "confirm") return true;
    return !optionStateFor(field.kind).error;
  }

  const activePlaceholderFields = computed(() =>
    placeholderFields.value.filter((field) => placeholderUsable(field)),
  );

  const placeholderFallbackHints = computed(() => {
    const hints: string[] = [];
    if (actionSchemaHint.value) hints.push(actionSchemaHint.value);
    for (const field of placeholderFields.value) {
      if (field.kind === "unsupported") {
        hints.push(`${field.param}（${placeholderLabelOf(field)}）暂无可选数据源，请直接填写。`);
      } else if (field.kind !== "confirm") {
        const error = optionStateFor(field.kind).error;
        if (error) hints.push(`${field.param}：${error}`);
      }
    }
    return [...new Set(hints)];
  });

  async function loadMaterials(seq: number): Promise<void> {
    materialOptionState.value = { ...emptyOptionState(), loading: true };
    try {
      const data = await options.api().domains.materialsV1.instances();
      if (seq !== loadSeq) return;
      const index = new Map<string, string>();
      const opts = data.map((item) => {
        index.set(item.material.material_uuid, item.material.name);
        return {
          label: item.material.resource_type
            ? `${item.material.name} · ${item.material.resource_type}`
            : item.material.name,
          value: item.material.material_uuid,
        };
      });
      materialNameByUuid.value = index;
      materialOptionState.value = { ...emptyOptionState(), options: opts };
    } catch {
      if (seq !== loadSeq) return;
      materialOptionState.value = {
        ...emptyOptionState(),
        error: "物料列表拉取失败，已回退为原始输入",
      };
    }
  }

  /** SiteSlot 数据源：物料聚合的 sites 展开成「物料名 · Site 标签」，值为 site uuid。 */
  async function loadSites(seq: number): Promise<void> {
    siteOptionState.value = { ...emptyOptionState(), loading: true };
    try {
      const data = await options.api().domains.materialsV1.instances();
      if (seq !== loadSeq) return;
      const opts = data.flatMap((item) =>
        (item.sites ?? []).map((site) => ({
          label: `${item.material.name} · ${site.label}${
            site.occupied_material_uuid ? "（已占用）" : ""
          }`,
          value: site.site_uuid,
        })),
      );
      siteOptionState.value = { ...emptyOptionState(), options: opts };
    } catch {
      if (seq !== loadSeq) return;
      siteOptionState.value = {
        ...emptyOptionState(),
        error: "Site 列表拉取失败，已回退为原始输入",
      };
    }
  }

  async function loadDevices(seq: number): Promise<void> {
    deviceOptionState.value = { ...emptyOptionState(), loading: true };
    try {
      const endpoints = await options.api().domains.runtimeV1.endpoints();
      if (seq !== loadSeq) return;
      const opts = [...new Set(
        endpoints
          .filter((endpoint) => endpoint.state === "online")
          .flatMap((endpoint) => endpoint.device_routes)
          .filter((route) => route.enabled && route.selected)
          .map((route) => route.device_uuid),
      )]
        .map((key) => ({ label: key, value: key }));
      deviceOptionState.value = { ...emptyOptionState(), options: opts };
    } catch {
      if (seq !== loadSeq) return;
      deviceOptionState.value = {
        ...emptyOptionState(),
        error: "在线设备拉取失败，已回退为原始输入",
      };
    }
  }

  async function loadClasses(seq: number): Promise<void> {
    classOptionState.value = { ...emptyOptionState(), loading: true };
    try {
      const data = await options.api().domains.materialsV1.templates();
      if (seq !== loadSeq) return;
      const opts = data.map((item) => ({
        label:
          item.display_name && item.display_name !== item.name
            ? `${item.display_name} · ${item.name}`
            : item.name,
        value: item.name,
      }));
      classOptionState.value = { ...emptyOptionState(), options: opts };
    } catch {
      if (seq !== loadSeq) return;
      classOptionState.value = {
        ...emptyOptionState(),
        error: "资源模板拉取失败，已回退为原始输入",
      };
    }
  }

  /** 出库资源类目录：registry 可实例化类（materials.v1 /registry-classes）。 */
  async function loadDeductClasses(seq: number): Promise<void> {
    deductOptionState.value = { ...emptyOptionState(), loading: true };
    try {
      const data = await options.api().domains.materialsV1.registryClasses();
      if (seq !== loadSeq) return;
      // label 同时含显示名与类 id（filterable 搜索两者都可命中）；
      // displayName/registryClass 供选项自定义渲染（主名 + 小字 id）。
      const opts = data.map((item) => {
        const displayName = item.display_name || item.registry_class;
        return {
          label:
            displayName !== item.registry_class
              ? `${displayName} · ${item.registry_class}`
              : item.registry_class,
          value: item.registry_class,
          displayName,
          registryClass: item.registry_class,
        };
      });
      deductOptionState.value = { ...emptyOptionState(), options: opts };
    } catch {
      if (seq !== loadSeq) return;
      deductOptionState.value = {
        ...emptyOptionState(),
        error: "出库资源类目录拉取失败，已回退为原始输入",
      };
    }
  }

  const RECENT_ASSIGNEES_KEY = "openlab:manual-confirm-assignees";

  /** 指派人：微后端无用户目录，用本机最近使用的指派人作为补全，允许自由输入。 */
  function loadConfirmUsers(seq: number): void {
    if (seq !== loadSeq) return;
    let recent: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_ASSIGNEES_KEY) ?? "[]");
      if (Array.isArray(raw)) recent = raw.filter((item) => typeof item === "string");
    } catch {
      recent = [];
    }
    confirmOptionState.value = {
      ...emptyOptionState(),
      options: recent.map((user) => ({ label: user, value: user })),
      allowFreeInput: true,
    };
  }

  /** 记住本次填写的指派人，供下次补全。 */
  function rememberAssignees(users: string[]): void {
    const merged = [...new Set([...users, ...confirmOptionState.value.options.map((o) => o.value)])]
      .filter(Boolean)
      .slice(0, 20);
    localStorage.setItem(RECENT_ASSIGNEES_KEY, JSON.stringify(merged));
  }

  /** 打开表单 / 切换动作时调用：识别 placeholder 字段并实时拉取可填项。 */
  async function reload(): Promise<void> {
    const seq = ++loadSeq;
    loadKey = `${options.device.value}|${options.action.value}`;
    actionSchemaHint.value = "";
    placeholderFields.value = [];
    let detail: DeviceActionSchemaDetail | null = null;
    if (options.device.value && options.action.value) {
      try {
        const endpoints = await options.api().domains.runtimeV1.endpoints();
        if (seq !== loadSeq) return;
        const capability = endpoints
          .flatMap((endpoint) => endpoint.action_capabilities)
          .find(
            (candidate) =>
              candidate.device_uuid === options.device.value &&
              candidate.action_name === options.action.value &&
              candidate.state === "active",
          );
        if (!capability) throw new Error("capability unavailable");
        detail = actionSchemaDetailFromCapability(capability);
        if (!detail.schema) detail = null;
      } catch {
        if (seq !== loadSeq) return;
        actionSchemaHint.value = "runtime.v1 动作定义不可用，已按原始字段展示。";
      }
    }
    if (options.prefillFromGoalDefault && detail) {
      prefillGoalDefault(detail.goal_default);
    }
    let param: Record<string, unknown> = {};
    try {
      param = parseNodeParam(options.paramJson.value);
    } catch {
      // 高级 JSON 未修复时跳过结构识别
    }
    placeholderFields.value = detectPlaceholderFields(detail, param);
    deductDrafts.value = {};
    const kinds = new Set(placeholderFields.value.map((field) => field.kind));
    if (kinds.has("resource")) void loadMaterials(seq);
    if (kinds.has("device")) void loadDevices(seq);
    if (kinds.has("site")) void loadSites(seq);
    if (kinds.has("class")) void loadClasses(seq);
    if (kinds.has("confirm")) loadConfirmUsers(seq);
    if (kinds.has("deduct")) void loadDeductClasses(seq);
  }

  /** 当前参数为空对象时用 schema 的 goal_default 预填（不覆盖用户已填内容）。 */
  function prefillGoalDefault(goalDefault: unknown): void {
    if (
      goalDefault === null ||
      typeof goalDefault !== "object" ||
      Array.isArray(goalDefault) ||
      !Object.keys(goalDefault).length
    ) {
      return;
    }
    try {
      if (Object.keys(parseNodeParam(options.paramJson.value)).length) return;
    } catch {
      return;
    }
    options.paramJson.value = JSON.stringify(goalDefault, null, 2);
  }

  // 表单内改设备/动作后重新识别 schema（防抖，避免逐字符请求）。
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  watch([options.device, options.action], () => {
    if (!options.active()) return;
    if (`${options.device.value}|${options.action.value}` === loadKey) return;
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => void reload(), 400);
  });

  const paramObject = computed<Record<string, unknown>>(() => {
    try {
      return parseNodeParam(options.paramJson.value);
    } catch {
      return {};
    }
  });

  function placeholderCurrentValue(
    field: PlaceholderField,
  ): string | string[] | null {
    const value = paramObject.value[field.param];
    if (field.kind === "resource" || field.kind === "deduct") {
      if (field.multiple) {
        return (Array.isArray(value) ? value : [])
          .map(resourceRefUuid)
          .filter(Boolean);
      }
      return resourceRefUuid(value) || null;
    }
    if (field.kind === "confirm" && field.multiple) {
      return (Array.isArray(value) ? value : [])
        .map((item) => String(item))
        .filter(Boolean);
    }
    return typeof value === "string" && value ? value : null;
  }

  /**
   * 判断参数是否显式提供了人工确认指派列表。
   *
   * `assignee_user_ids` 的缺省（没有这个 key）与显式 `[]` 不是同一个
   * 请求语义：前者表示调用方尚未作出选择，后者表示不指派、任何人可确认。
   * 不用 truthy 判断，确保空数组仍被视为已填写。
   */
  function placeholderHasExplicitValue(field: PlaceholderField): boolean {
    if (field.kind !== "confirm" || !field.multiple) return true;
    return (
      Object.prototype.hasOwnProperty.call(paramObject.value, field.param) &&
      Array.isArray(paramObject.value[field.param])
    );
  }

  function placeholderSelectOptions(
    field: PlaceholderField,
  ): { label: string; value: string }[] {
    const opts = [...optionStateFor(field.kind).options];
    const current = placeholderCurrentValue(field);
    const values = Array.isArray(current) ? current : current ? [current] : [];
    for (const value of values) {
      if (opts.some((option) => option.value === value)) continue;
      const label =
        field.kind === "resource"
          ? resourceRefLabel(paramObject.value[field.param]) || value
          : value;
      opts.unshift({ label: `${label}（当前值）`, value });
    }
    return opts;
  }

  function updatePlaceholderValue(
    field: PlaceholderField,
    selected: string | string[] | null,
  ): void {
    try {
      const param = parseNodeParam(options.paramJson.value);
      if (field.kind === "resource") {
        const materialRef = (uuid: string, existing: unknown) =>
          resourceRefValue(existing, {
            uuid,
            name: materialNameByUuid.value.get(uuid) ?? "",
          });
        if (field.multiple) {
          param[field.param] = (Array.isArray(selected) ? selected : []).map(
            (uuid) => materialRef(String(uuid), {}),
          );
        } else if (selected) {
          param[field.param] = materialRef(String(selected), param[field.param]);
        } else {
          param[field.param] = resourceRefValue(param[field.param], {
            uuid: "",
            name: "",
          });
        }
      } else if (field.kind === "confirm" && field.multiple) {
        const users = (Array.isArray(selected) ? selected : []).map((item) => String(item));
        param[field.param] = users;
        rememberAssignees(users);
      } else {
        if (field.kind === "confirm" && selected) rememberAssignees([String(selected)]);
        param[field.param] = selected === null ? "" : String(selected);
      }
      options.paramJson.value = JSON.stringify(param, null, 2);
      options.onParamWritten?.(null, selected);
    } catch {
      options.onError?.("参数不是合法 JSON 对象");
    }
  }

  /** deduct 字段当前已出库产物的展示标签（空串 = 尚未出库）。 */
  function deductCurrentLabel(field: PlaceholderField): string {
    const value = paramObject.value[field.param];
    const uuid = resourceRefUuid(value);
    if (!uuid) return "";
    const name =
      resourceRefLabel(value) || materialNameByUuid.value.get(uuid) || "";
    return name ? `${name}（${uuid.slice(0, 8)}…）` : uuid;
  }

  /** deduct 字段草稿（响应式；不存在时初始化）。 */
  function deductDraftFor(param: string): DeductDraftState {
    if (!deductDrafts.value[param]) {
      deductDrafts.value[param] = {
        registryClass: "",
        name: "",
        quantity: 1,
        barcode: "",
        busy: false,
      };
    }
    return deductDrafts.value[param];
  }

  /**
   * 执行物料出库：按草稿（资源类 + 实例名 + 数量 + 可选条码）循环调
   * materials.v1 /instantiate。数量 >1 时实例名自动加 -1/-2… 序号后缀，
   * 条码仅数量为 1 时随请求下发。成功实例写回参数（multiple 字段追加全部
   * 引用，单值字段写第一个），逐个失败即时提示，最后给汇总消息。
   */
  async function submitDeduct(field: PlaceholderField): Promise<void> {
    const draft = deductDraftFor(field.param);
    if (!draft.registryClass) {
      options.onError?.("请先选择出库资源类");
      return;
    }
    const quantity = Math.min(50, Math.max(1, Math.floor(draft.quantity || 1)));
    const base =
      draft.name.trim() ||
      `${draft.registryClass}_${Date.now().toString(36)}`;
    const barcode = quantity === 1 ? draft.barcode.trim() : "";
    draft.busy = true;
    const created: { uuid: string; name: string }[] = [];
    let failedCount = 0;
    try {
      for (let index = 0; index < quantity; index += 1) {
        const name = quantity === 1 ? base : `${base}-${index + 1}`;
        try {
          const result = await options
            .api()
            .domains.materialsV1.instantiate(
              draft.registryClass,
              name,
              barcode || undefined,
            );
          const tree = result.data;
          const rootUuid = tree.root_material_uuid;
          const root = tree.nodes.find(
            (node) => node.material.material_uuid === rootUuid,
          );
          const rootName = root?.material.name ?? name;
          materialNameByUuid.value.set(rootUuid, rootName);
          created.push({ uuid: rootUuid, name: rootName });
        } catch (err) {
          failedCount += 1;
          options.onError?.(
            `物料出库失败（${name}）：${
              describeError(err)
            }`,
          );
        }
      }
      if (!created.length) return;
      try {
        const param = parseNodeParam(options.paramJson.value);
        if (field.multiple) {
          const existing = Array.isArray(param[field.param])
            ? (param[field.param] as unknown[])
            : [];
          param[field.param] = [
            ...existing,
            ...created.map((item) =>
              resourceRefValue({}, { uuid: item.uuid, name: item.name }),
            ),
          ];
        } else {
          param[field.param] = resourceRefValue(param[field.param], {
            uuid: created[0].uuid,
            name: created[0].name,
          });
        }
        options.paramJson.value = JSON.stringify(param, null, 2);
        options.onParamWritten?.(null, created[0].uuid);
      } catch {
        options.onError?.("参数不是合法 JSON 对象");
        return;
      }
      options.onSuccess?.(
        quantity === 1
          ? `已出库：${created[0].name}`
          : `出库完成：成功 ${created.length}/${quantity} 个${
              failedCount ? `，失败 ${failedCount} 个` : ""
            }`,
      );
    } finally {
      draft.busy = false;
    }
  }

  const paramFields = computed<ParameterField[]>(() => {
    // 已由选择器接管的 placeholder 参数不再平铺出叶子字段（回退时仍平铺）。
    const handled = new Set(
      activePlaceholderFields.value.map((field) => field.param),
    );
    try {
      return flattenParameterFields(parseNodeParam(options.paramJson.value)).filter(
        (field) => !handled.has(field.path.split(".")[0]),
      );
    } catch {
      return [];
    }
  });

  function isFieldFocused(path: string): boolean {
    return options.isFocused?.(path) ?? false;
  }

  // 有置顶回调（编辑器）时默认只暴露置顶字段；无回调（设备页）默认全量。
  const hasFocusConcept = Boolean(options.isFocused);
  const showAllParams = ref(!hasFocusConcept);
  const visibleParamFields = computed<ParameterField[]>(() =>
    showAllParams.value
      ? paramFields.value
      : paramFields.value.filter((field) => isFieldFocused(field.path)),
  );
  const collapsedParamCount = computed(
    () => paramFields.value.length - visibleParamFields.value.length,
  );

  function updateField(field: ParameterField, value: unknown): void {
    try {
      const param = parseNodeParam(options.paramJson.value);
      writePath(param, field.path, value);
      options.paramJson.value = JSON.stringify(param, null, 2);
      options.onParamWritten?.(field.path, value);
    } catch {
      options.onError?.("参数不是合法 JSON 对象");
    }
  }

  return {
    placeholderFields,
    actionSchemaHint,
    activePlaceholderFields,
    placeholderFallbackHints,
    optionStateFor,
    placeholderCurrentValue,
    placeholderHasExplicitValue,
    placeholderSelectOptions,
    updatePlaceholderValue,
    deductDrafts,
    deductDraftFor,
    deductCurrentLabel,
    submitDeduct,
    paramFields,
    hasFocusConcept,
    showAllParams,
    visibleParamFields,
    collapsedParamCount,
    isFieldFocused,
    updateField,
    reload,
  };
}

export type ActionParamForm = ReturnType<typeof useActionParamForm>;
