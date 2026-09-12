<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NSpace,
  useMessage,
} from "naive-ui";
import {
  BeakerOutline,
  ColorFillOutline,
  CogOutline,
  FlaskOutline,
  HardwareChipOutline,
  PlayOutline,
  PulseOutline,
  RefreshOutline,
  SpeedometerOutline,
  Star,
  StarOutline,
  ThermometerOutline,
  WaterOutline,
} from "@vicons/ionicons5";
import {
  actionDisplayName,
  type JsonObject,
  type RuntimeActionCapability,
  type TelemetryV1Event,
} from "@openlab/protocol";
import ActionParamFields from "../components/ActionParamFields.vue";
import PageHeader from "../components/PageHeader.vue";
import { useActionParamForm } from "../features/action-param-form";
import { runtimeActionParams } from "../features/runtime-actions";
import { useConnectionStore } from "../stores/connection";
import { useDevicesStore, type DeviceRecord } from "../stores/devices";
import { useDomainThemeStore } from "../stores/domain-theme";
import { usePinnedMetricsStore } from "../stores/pinned-metrics";
import { describeError } from "../features/errors";

const conn = useConnectionStore();
const domain = useDomainThemeStore();
const message = useMessage();
const pinned = usePinnedMetricsStore();
const deviceStore = useDevicesStore();
const router = useRouter();

type DeviceAction = RuntimeActionCapability;

/** 收藏 / 取消收藏：明确告诉操作员它去了哪里。 */
function togglePin(deviceId: string, prop: string) {
  const wasPinned = pinned.isPinned(deviceId, prop);
  pinned.toggle(deviceId, prop);
  if (wasPinned) {
    message.info(`已取消收藏 ${prop}`);
    return;
  }
  message.success(`已收藏 ${prop}：在运行总览「收藏指标」和设备卡片上实时显示`, { duration: 3500 });
}

/** 某设备被收藏的属性名（设备卡片上优先展示、带星标）。 */
function pinnedPropsOf(deviceId: string): string[] {
  return pinned.pins.filter((pin) => pin.deviceId === deviceId).map((pin) => pin.prop);
}

const filter = ref("");
const showHostNode = ref(false);

const devices = computed<DeviceRecord[]>(() => {
  const keyword = filter.value.trim().toLowerCase();
  return deviceStore.devices.filter((device) => {
    if (device.isHostNode && !showHostNode.value) return false;
    if (!keyword) return true;
    return (
      device.id.toLowerCase().includes(keyword) ||
      device.displayName.toLowerCase().includes(keyword) ||
      device.className.toLowerCase().includes(keyword) ||
      device.machineName.toLowerCase().includes(keyword)
    );
  });
});
const loading = computed(() => deviceStore.loading && !deviceStore.loaded);
const unavailable = computed(() => !conn.online);
const executionDisabled = computed(() => conn.online && !conn.executionReady);

// 动作 → 单点设备动作任务（execution_kind=ad_hoc_device_action）
const showRun = ref(false);
const runDeviceId = ref("");
const runActionName = ref("");
const runActionType = ref("");
const runParamJson = ref("{}");
const submitting = ref(false);

// 参数表单核心与编辑器节点浮层同源（features/action-param-form.ts）：
// schema 识别 + placeholder 动态可填项 + legacy Resource 结构识别；
// 设备页没有置顶变量概念，默认全量展示字段。
const runForm = useActionParamForm({
  api: () => conn.api,
  device: runDeviceId,
  action: runActionName,
  paramJson: runParamJson,
  active: () => showRun.value,
  onError: (text) => message.error(text),
  onSuccess: (text) => message.success(text),
  prefillFromGoalDefault: true,
});

function deviceKey(row: DeviceRecord): string {
  return row.id;
}

const sortedDevices = computed(() => devices.value);

/** 设备图形符号：按 id 关键词挑仪器图标 + 配色，让每张卡有辨识度 */
const GLYPHS: { match: RegExp; icon: Component; from: string; to: string; fg: string }[] = [
  { match: /pipette|liquid|dispens|aspirate/i, icon: WaterOutline, from: "#E0EDFF", to: "#C7DFFF", fg: "#0B5FD0" },
  { match: /stir|shake|mix|vortex/i, icon: CogOutline, from: "#FFF0DB", to: "#FFE3BC", fg: "#B06E00" },
  { match: /ph|meter|sensor|balance|scale/i, icon: SpeedometerOutline, from: "#E4F8EE", to: "#C8F0DC", fg: "#067A4B" },
  { match: /heat|temp|thermo|oven|incubat/i, icon: ThermometerOutline, from: "#FFE7E2", to: "#FFD2C9", fg: "#C2452D" },
  { match: /wash|clean|pump/i, icon: ColorFillOutline, from: "#E3F3FB", to: "#C5E7F7", fg: "#0A6C99" },
  { match: /react|synth|column|chrom/i, icon: FlaskOutline, from: "#F0E9FF", to: "#E0D2FF", fg: "#6636CC" },
  { match: /gc|ms|hplc|nmr|analy/i, icon: BeakerOutline, from: "#EAF0F6", to: "#D6E2ED", fg: "#33526E" },
];

function glyphOf(deviceId: string) {
  return (
    GLYPHS.find((g) => g.match.test(deviceId)) ?? {
      icon: HardwareChipOutline,
      from: "#E8EBEF",
      to: "#D8DDE3",
      fg: "#42566A",
    }
  );
}

function actionName(a: DeviceAction): string {
  return a.action_name;
}

function actionLabel(a: DeviceAction): string {
  return actionDisplayName(a.action_name, a.descriptor);
}

function isBusy(a: DeviceAction): boolean {
  return a.availability === "busy";
}

function originLabel(device: DeviceRecord): string {
  if (device.origin === "slave") return `Slave · ${device.machineName || device.peer?.node_id || "远端"}`;
  if (device.origin === "host") return `Host · ${device.machineName || "本机"}`;
  return device.machineName || "未知来源";
}

async function refresh() {
  await Promise.all([deviceStore.refresh(), syncDeviceState()]);
}

const runAlwaysFree = ref(false);

function openRun(deviceId: string, action: DeviceAction) {
  runDeviceId.value = deviceId;
  runActionName.value = action.action_name;
  runActionType.value = String(action.action_type ?? action.descriptor.type ?? "");
  runAlwaysFree.value = action.descriptor.always_free === true;
  // registry goal_default 优先铺参数模板；schema 带 goal_default 时若参数仍为空由表单核心再预填。
  const template = runtimeActionParams(action);
  runParamJson.value = Object.keys(template).length
    ? JSON.stringify(template, null, 2)
    : "{}";
  showRun.value = true;
  void runForm.reload();
}

async function submitRun() {
  if (!conn.schedulerLocal) {
    message.warning("当前进程不持有调度权威，请连接 Workflow Authority 所在进程后再提交动作。");
    return;
  }
  submitting.value = true;
  try {
    const param = JSON.parse(runParamJson.value) as JsonObject;
    const task = await conn.api.domains.workflowBackend.createTask({
      execution_kind: "ad_hoc_device_action",
      device_id: runDeviceId.value,
      action_name: runActionName.value,
      action_type: runActionType.value,
      param,
      execution_policy: runAlwaysFree.value ? { always_free: true } : {},
      description: `设备页单点动作 ${runDeviceId.value}/${runActionName.value}`,
    });
    message.success(`已提交单点动作任务 ${task.uuid.slice(0, 8)}…`);
    showRun.value = false;
  } catch (err) {
    message.error(describeError(err));
  } finally {
    submitting.value = false;
  }
}

// ── 设备最新状态快照（telemetry v1，周期拉取） ──

type PropReading = { value: unknown; updated_at: number };

const liveProps = ref<Record<string, Record<string, PropReading>>>({});
const nowMs = ref(Date.now());
const telemetryLive = ref(false);

/** 状态类字符串属性优先展示；数值属性按此序补位。 */
const PROP_PRIORITY = [
  "status",
  "operation_mode",
  "valve_status",
  "pump_state",
  "stir_state",
  "rotate_state",
  "heating_state",
  "power_state",
  "current_temperature",
  "temperature",
  "target_temperature",
  "stir_speed",
  "vacuum_level",
  "pressure",
  "flow_rate",
  "progress",
  "remaining_time",
];

const PROP_LABELS: Record<string, string> = {
  status: "状态",
  operation_mode: "模式",
  valve_status: "阀位",
  pump_state: "泵态",
  stir_state: "搅拌",
  rotate_state: "旋转",
  heating_state: "加热",
  power_state: "电源",
  current_temperature: "温度",
  temperature: "温度",
  target_temperature: "目标温度",
  stir_speed: "转速",
  vacuum_level: "真空度",
  pressure: "压力",
  flow_rate: "流速",
  progress: "进度",
  remaining_time: "剩余时间",
};

function propLabel(name: string): string {
  return PROP_LABELS[name] ?? name;
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value ?? "—");
}

/** 卡片状态条：优先级排序取前 5 个属性。 */
function cardProps(deviceId: string): { name: string; reading: PropReading; pinned: boolean }[] {
  const props = liveProps.value[deviceId];
  if (!props) return [];
  const pinnedNames = pinnedPropsOf(deviceId);
  // 收藏的属性永远排最前并全部显示，其余按优先级补足到 5 个
  const names = Object.keys(props).sort((a, b) => {
    const pa = pinnedNames.includes(a) ? 0 : 1;
    const pb = pinnedNames.includes(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ia = PROP_PRIORITY.indexOf(a);
    const ib = PROP_PRIORITY.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const limit = Math.max(5, pinnedNames.length);
  return names.slice(0, limit).map((name) => ({ name, reading: props[name], pinned: pinnedNames.includes(name) }));
}

function isFresh(reading: PropReading): boolean {
  return nowMs.value - reading.updated_at < 8000;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, nowMs.value - ts);
  if (diff < 5000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return `${Math.floor(diff / 3_600_000)} 小时前`;
}

async function syncDeviceState() {
  try {
    const states = await conn.api.domains.telemetryV1.states();
    const next: Record<string, Record<string, PropReading>> = {};
    for (const snapshot of states) {
      const bucket: Record<string, PropReading> = {};
      const values = { ...snapshot.state, ...snapshot.properties };
      for (const [name, value] of Object.entries(values)) {
        const wrapped = value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
        bucket[name] = {
          value: wrapped && "value" in wrapped ? wrapped.value : value,
          updated_at: Number(wrapped?.updated_at_ms ?? snapshot.observed_at_ms),
        };
      }
      // 连接态只有明确值（online/offline/degraded）时才作为属性展示。
      if (snapshot.connection_state !== "unknown") {
        bucket.connection_state = {
          value: snapshot.connection_state,
          updated_at: snapshot.observed_at_ms,
        };
      }
      next[snapshot.device_uuid] = bucket;
    }
    liveProps.value = next;
    telemetryLive.value = true;
  } catch {
    telemetryLive.value = false;
    // 状态接口不可用时保持上次快照。
  }
}

// ── 设备属性抽屉（全部属性 + 数值历史 sparkline） ──

const detailOpen = ref(false);
const detailDeviceId = ref("");
const sparkOf = ref<Record<string, number[]>>({});

const detailRows = computed(() => {
  const props = liveProps.value[detailDeviceId.value] ?? {};
  return Object.keys(props)
    .sort((a, b) => {
      const ia = PROP_PRIORITY.indexOf(a);
      const ib = PROP_PRIORITY.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    })
    .map((name) => ({ name, reading: props[name] }));
});

function sparkPoints(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 26;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

async function loadSparks(deviceId: string) {
  const props = liveProps.value[deviceId] ?? {};
  const numeric = Object.entries(props)
    .filter(([, r]) => typeof r.value === "number")
    .map(([name]) => name)
    .slice(0, 8);
  const events = await conn.api.domains.telemetryV1.events({
    device_uuid: deviceId,
    event_type: "property_sample",
    limit: 500,
  }).catch(() => []);
  const next: Record<string, number[]> = {};
  for (const name of numeric) {
    const values = events
      .map((event) => historySample(event, name))
      .filter((row): row is { ts: number; value: unknown } => row !== null)
      .sort((a, b) => a.ts - b.ts)
      .map((row) => Number(row.value))
      .filter(Number.isFinite);
    if (values.length >= 2) next[name] = values.slice(-80);
  }
  sparkOf.value = next;
}

function openDetail(deviceId: string) {
  detailDeviceId.value = deviceId;
  sparkOf.value = {};
  detailOpen.value = true;
  void loadSparks(deviceId);
}

watch(detailOpen, (open) => {
  if (!open) detailDeviceId.value = "";
});

// ── 属性历史曲线放大视图：点击属性行弹出（手绘 SVG，零新依赖） ──
// 数值属性画连续折线；布尔/枚举/字符串状态画阶梯图（值变化跳变一目了然）。
// 数据源 telemetry.v1 property_sample 追加事件，时间范围切换 + 悬浮十字线。

const CURVE_W = 660;
const CURVE_H = 250;
const CURVE_PAD = { l: 56, r: 16, t: 14, b: 30 };
/** 单次最多取的变化点数（devicePropertyHistory limit）。 */
const CURVE_LIMIT = 500;
const CURVE_RANGES = [
  { label: "近30分钟", ms: 30 * 60_000 },
  { label: "近2小时", ms: 2 * 3_600_000 },
  { label: "近24小时", ms: 24 * 3_600_000 },
  { label: "全部", ms: 0 },
] as const;

const curveOpen = ref(false);
const curveDeviceId = ref("");
const curveProp = ref("");
const curveLoading = ref(false);
const curveRangeMs = ref<number>(CURVE_RANGES[1].ms);
const curveRows = ref<{ ts: number; value: unknown }[]>([]);
const curveValueType = ref("");
const curveHoverIdx = ref<number | null>(null);

function openCurve(propName: string) {
  curveDeviceId.value = detailDeviceId.value;
  curveProp.value = propName;
  curveHoverIdx.value = null;
  curveOpen.value = true;
  void loadCurve();
}

async function loadCurve(): Promise<void> {
  curveLoading.value = true;
  curveHoverIdx.value = null;
  try {
    const since = curveRangeMs.value ? Date.now() - curveRangeMs.value : 0;
    const raw = await conn.api.domains.telemetryV1.events({
      device_uuid: curveDeviceId.value,
      event_type: "property_sample",
      observed_from_ms: since || undefined,
      limit: CURVE_LIMIT,
    });
    curveRows.value = raw
      .map((event) => historySample(event, curveProp.value))
      .filter((row): row is { ts: number; value: unknown } => row !== null)
      .sort((a, b) => a.ts - b.ts);
    curveValueType.value = typeof curveRows.value[0]?.value;
  } catch {
    curveRows.value = [];
  } finally {
    curveLoading.value = false;
  }
}

function historySample(
  event: TelemetryV1Event,
  property: string,
): { ts: number; value: unknown } | null {
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : null;
  const eventProperty = String(payload?.property ?? event.event_key ?? "");
  if (eventProperty && eventProperty !== property) return null;
  const value = payload && "value" in payload
    ? payload.value
    : payload && property in payload
      ? payload[property]
      : undefined;
  if (value === undefined) return null;
  return { ts: event.observed_at_ms, value };
}

watch(curveRangeMs, () => {
  if (curveOpen.value) void loadCurve();
});

const curveIsNumeric = computed(() => {
  if (curveValueType.value === "int" || curveValueType.value === "float") return true;
  if (curveValueType.value === "bool" || curveValueType.value === "str") return false;
  return (
    curveRows.value.length > 0 &&
    curveRows.value.every((row) => typeof row.value === "number")
  );
});

interface CurvePoint {
  x: number;
  y: number;
  ts: number;
  label: string;
}

interface CurveModel {
  kind: "line" | "step";
  points: CurvePoint[];
  path: string;
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
}

function curveTimeLabel(ts: number, spanMs: number): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (spanMs > 24 * 3_600_000) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  return hm;
}

function fmtCurveTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const curveModel = computed<CurveModel | null>(() => {
  const rows = curveRows.value;
  if (!rows.length) return null;
  const innerW = CURVE_W - CURVE_PAD.l - CURVE_PAD.r;
  const innerH = CURVE_H - CURVE_PAD.t - CURVE_PAD.b;
  const right = CURVE_W - CURVE_PAD.r;
  const t0 = rows[0].ts;
  const t1 = rows[rows.length - 1].ts;
  const span = Math.max(1, t1 - t0);
  const xOf = (ts: number) => CURVE_PAD.l + ((ts - t0) / span) * innerW;
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => ({
    x: CURVE_PAD.l + f * innerW,
    label: curveTimeLabel(t0 + f * span, span),
  }));

  if (curveIsNumeric.value) {
    const values = rows.map((row) => Number(row.value));
    let vmin = Math.min(...values);
    let vmax = Math.max(...values);
    if (vmin === vmax) {
      vmin -= 1;
      vmax += 1;
    }
    const yOf = (v: number) =>
      CURVE_PAD.t + (1 - (v - vmin) / (vmax - vmin)) * innerH;
    const points: CurvePoint[] = rows.map((row, i) => ({
      x: xOf(row.ts),
      y: yOf(values[i]),
      ts: row.ts,
      label: formatValue(row.value),
    }));
    let path = points
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    // 值变化才落行：最后一个值保持到当前，延伸到右缘。
    path += ` L${right} ${points[points.length - 1].y.toFixed(1)}`;
    const yTicks = [vmax, (vmin + vmax) / 2, vmin].map((v) => ({
      y: yOf(v),
      label: formatValue(v),
    }));
    return { kind: "line", points, path, yTicks, xTicks };
  }

  // 阶梯图：离散状态按首次出现序分层
  const levels: string[] = [];
  for (const row of rows) {
    const key = formatValue(row.value);
    if (!levels.includes(key)) levels.push(key);
  }
  const yOf = (key: string) =>
    levels.length === 1
      ? CURVE_PAD.t + innerH / 2
      : CURVE_PAD.t + innerH - (levels.indexOf(key) / (levels.length - 1)) * innerH;
  const points: CurvePoint[] = rows.map((row) => {
    const key = formatValue(row.value);
    return { x: xOf(row.ts), y: yOf(key), ts: row.ts, label: key };
  });
  let path = "";
  points.forEach((p, i) => {
    if (i === 0) {
      path = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      return;
    }
    const prevY = points[i - 1].y.toFixed(1);
    path += ` L${p.x.toFixed(1)} ${prevY} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  path += ` L${right} ${points[points.length - 1].y.toFixed(1)}`;
  const yTicks = levels.map((label) => ({ y: yOf(label), label }));
  return { kind: "step", points, path, yTicks, xTicks };
});

function onCurveMove(evt: MouseEvent): void {
  const model = curveModel.value;
  if (!model) return;
  const rect = (evt.currentTarget as SVGElement).getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * CURVE_W;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  model.points.forEach((p, i) => {
    const dist = Math.abs(p.x - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  curveHoverIdx.value = best;
}

const curveHoverPoint = computed<CurvePoint | null>(() => {
  const model = curveModel.value;
  if (!model || curveHoverIdx.value === null) return null;
  return model.points[curveHoverIdx.value] ?? null;
});

let stateTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  deviceStore.startPolling();
  void syncDeviceState();
  // 设备状态快照周期拉取，保持与主机一致。
  stateTimer = setInterval(() => void syncDeviceState(), 5000);
  clockTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
});
onUnmounted(() => {
  deviceStore.stopPolling();
  if (stateTimer !== null) clearInterval(stateTimer);
  if (clockTimer !== null) clearInterval(clockTimer);
});
</script>

<template>
  <div>
    <PageHeader
      :title="domain.config.nav.devices"
      :subtitle="`${deviceStore.onlineCount} / ${deviceStore.instruments.length} 台在线 · ${deviceStore.actionCount} 个可执行动作${deviceStore.busyCount ? ` · ${deviceStore.busyCount} 台执行中` : ''}`"
    >
      <template #actions>
        <NInput
          v-model:value="filter"
          size="small"
          clearable
          placeholder="搜索设备 / 类名 / 机器"
          style="width: 220px"
        />
        <NButton size="small" quaternary @click="showHostNode = !showHostNode">
          {{ showHostNode ? "隐藏 HostNode" : "显示 HostNode" }}
        </NButton>
        <NButton
          v-if="pinned.pins.length"
          size="small"
          quaternary
          title="收藏的设备属性汇总在运行总览的「收藏指标」卡片"
          @click="router.push('/')"
        >
          <template #icon><NIcon class="live-star"><Star /></NIcon></template>
          已收藏 {{ pinned.pins.length }} 项 · 去总览
        </NButton>
        <NButton size="small" :loading="deviceStore.loading" @click="refresh">
          <template #icon>
            <NIcon><RefreshOutline /></NIcon>
          </template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <NAlert v-if="unavailable" type="info" title="设备列表暂时不可用">
      尚未连接微后端；连接恢复后设备目录会自动刷新。
    </NAlert>
    <NAlert v-else-if="executionDisabled && !devices.length" type="info" title="当前进程没有设备执行面">
      你连接的是 <code>--role backend</code> 调度权威进程，它不直接管理设备。要查看设备与遥测，请连接带 HostNode 的 Host 进程（默认 <code>:8002</code>）。
    </NAlert>

    <template v-else>
      <NEmpty
        v-if="!devices.length && !loading"
        :description="filter ? '没有匹配的设备' : '尚未发现设备：Host 启动并完成 endpoint 能力快照后会自动出现'"
        style="padding: 64px 0"
      />
      <div v-else class="device-grid">
        <div
          v-for="dev in sortedDevices"
          :key="deviceKey(dev)"
          class="device-card"
          :class="{ offline: !dev.online }"
        >
          <!-- 仪器铭牌区 -->
          <div class="device-head">
            <div
              class="device-glyph"
              :style="{ color: glyphOf(`${dev.id} ${dev.className}`).fg }"
            >
              <NIcon size="28"><component :is="glyphOf(`${dev.id} ${dev.className}`).icon" /></NIcon>
            </div>
            <div class="device-titles">
              <span class="device-name">{{ dev.displayName }}</span>
              <span class="device-sub mono">
                {{ dev.id }}<template v-if="dev.className && dev.className !== dev.id"> · {{ dev.className }}</template>
              </span>
              <span class="device-sub">
                {{ originLabel(dev) }}
                <template v-if="dev.transport"> · {{ dev.transport }}</template>
                <template v-if="dev.sites.length"> · {{ dev.sites.length }} 个位点</template>
              </span>
            </div>
            <div class="device-led" :class="{ off: !dev.online }" :title="dev.online ? '在线' : '离线'">
              <span class="led" />
              <span class="led-text">{{ dev.online ? "在线" : "离线" }}</span>
            </div>
          </div>

          <!-- 设备实时状态快照 -->
          <div
            v-if="cardProps(deviceKey(dev)).length"
            class="device-live"
            title="点击查看全部属性与历史曲线"
            @click="openDetail(deviceKey(dev))"
          >
            <span
              v-for="item in cardProps(deviceKey(dev))"
              :key="item.name"
              class="live-chip"
              :class="{ fresh: isFresh(item.reading), pinned: item.pinned }"
              :title="item.pinned ? '已收藏：同时显示在运行总览「收藏指标」' : undefined"
            >
              <NIcon v-if="item.pinned" size="11" class="live-star"><Star /></NIcon>
              <span v-else class="live-dot" />
              <span class="live-name">{{ propLabel(item.name) }}</span>
              <span class="live-value">{{ formatValue(item.reading.value) }}</span>
            </span>
            <span class="live-more">全部 ›</span>
          </div>

          <!-- 动作面板：直接铺开，不需点击展开 -->
          <div class="device-actions">
            <div v-if="!dev.actions.length" class="actions-note">
              {{ dev.online ? "该设备未声明可执行动作" : "设备离线，动作不可用" }}
            </div>
            <template v-else>
              <div
                v-for="a in dev.actions"
                :key="actionName(a)"
                class="action-panel"
                :class="{ busy: isBusy(a) }"
              >
                <div class="action-meta">
                  <span class="action-name">{{ actionLabel(a) }}</span>
                  <span v-if="actionLabel(a) !== actionName(a)" class="action-id mono">{{ actionName(a) }}</span>
                  <span v-if="a.descriptor.always_free" class="free-chip" title="可与其他动作同时执行">并发</span>
                  <span v-if="isBusy(a)" class="busy-chip">
                    <span class="busy-dot" />执行中
                  </span>
                </div>
                <button
                  class="run-btn"
                  :disabled="isBusy(a) || !dev.online"
                  :title="isBusy(a) ? '动作占用中' : dev.online ? '运行' : '设备离线'"
                  @click="openRun(deviceKey(dev), a)"
                >
                  <NIcon size="14"><PlayOutline /></NIcon>
                  运行
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- 设备属性抽屉：全部实时属性 + 数值历史曲线 -->
    <NDrawer v-model:show="detailOpen" :width="420" placement="right">
      <NDrawerContent :title="`${detailDeviceId} · 实时状态`" closable>
        <NButton size="small" style="margin-bottom: 12px" @click="router.push({ path: '/logs', query: { device: detailDeviceId } })">查看所在进程日志</NButton>
        <div class="live-legend">
          <span class="live-dot on" /> 8 秒内有更新
          <span style="margin-left: 12px" :style="{ color: telemetryLive ? '#04aa65' : '#c2452d' }">
            {{ telemetryLive ? "实时数据已连接" : "实时数据暂不可用" }}
          </span>
        </div>
        <NEmpty
          v-if="!detailRows.length"
          size="small"
          description="该设备暂无属性上报"
          style="margin-top: 32px"
        />
        <div
          v-for="row in detailRows"
          :key="row.name"
          class="prop-row clickable"
          title="点击查看状态变化曲线"
          @click="openCurve(row.name)"
        >
          <div class="prop-main">
            <span class="prop-dot" :class="{ on: isFresh(row.reading) }" />
            <div class="prop-text">
              <span class="prop-name">
                {{ propLabel(row.name) }}
                <small v-if="propLabel(row.name) !== row.name">{{ row.name }}</small>
              </span>
              <span class="prop-time">{{ relativeTime(row.reading.updated_at) }}</span>
            </div>
            <span class="prop-value">{{ formatValue(row.reading.value) }}</span>
            <button
              type="button"
              class="prop-pin"
              :class="{ pinned: pinned.isPinned(detailDeviceId, row.name) }"
              :title="pinned.isPinned(detailDeviceId, row.name) ? '取消收藏' : '收藏：显示在运行总览「收藏指标」和本设备卡片上'"
              @click.stop="togglePin(detailDeviceId, row.name)"
            >
              <NIcon size="14">
                <Star v-if="pinned.isPinned(detailDeviceId, row.name)" />
                <StarOutline v-else />
              </NIcon>
            </button>
            <span class="prop-curve-icon" title="历史曲线">
              <NIcon size="14"><PulseOutline /></NIcon>
            </span>
          </div>
          <svg
            v-if="sparkOf[row.name]"
            class="prop-spark"
            viewBox="0 0 120 26"
            preserveAspectRatio="none"
          >
            <polyline
              :points="sparkPoints(sparkOf[row.name])"
              fill="none"
              stroke="#2e5bff"
              stroke-width="1.5"
            />
          </svg>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- 属性历史曲线放大视图：数值折线 / 状态阶梯 + 时间范围 + 悬浮十字线 -->
    <NModal
      v-model:show="curveOpen"
      preset="card"
      :title="`${curveDeviceId} · ${propLabel(curveProp)} 历史曲线`"
      style="width: 760px"
    >
      <div class="curve-toolbar">
        <div class="curve-ranges">
          <button
            v-for="range in CURVE_RANGES"
            :key="range.label"
            type="button"
            class="range-btn"
            :class="{ active: curveRangeMs === range.ms }"
            @click="curveRangeMs = range.ms"
          >
            {{ range.label }}
          </button>
        </div>
        <span class="curve-kind">
          {{ curveModel?.kind === "step" ? "阶梯图 · 状态跳变" : "折线图 · 数值变化" }}
          · 值变化才记录（最多取 {{ CURVE_LIMIT }} 点）
        </span>
      </div>
      <NEmpty
        v-if="!curveLoading && !curveRows.length"
        size="small"
        description="该时间范围内没有变化记录"
        style="padding: 48px 0"
      />
      <template v-else>
        <svg
          class="curve-svg"
          :viewBox="`0 0 ${CURVE_W} ${CURVE_H}`"
          @mousemove="onCurveMove"
          @mouseleave="curveHoverIdx = null"
        >
          <template v-if="curveModel">
            <line
              v-for="(tick, i) in curveModel.yTicks"
              :key="`gy-${i}`"
              :x1="CURVE_PAD.l"
              :x2="CURVE_W - CURVE_PAD.r"
              :y1="tick.y"
              :y2="tick.y"
              class="curve-grid"
            />
            <text
              v-for="(tick, i) in curveModel.yTicks"
              :key="`ty-${i}`"
              :x="CURVE_PAD.l - 6"
              :y="tick.y + 3"
              class="curve-label y"
            >
              {{ tick.label }}
            </text>
            <text
              v-for="(tick, i) in curveModel.xTicks"
              :key="`tx-${i}`"
              :x="tick.x"
              :y="CURVE_H - 8"
              class="curve-label x"
            >
              {{ tick.label }}
            </text>
            <path :d="curveModel.path" class="curve-path" />
            <circle
              v-for="(p, i) in curveModel.points"
              :key="`pt-${i}`"
              :cx="p.x"
              :cy="p.y"
              r="2.2"
              class="curve-dot"
            />
            <template v-if="curveHoverPoint">
              <line
                :x1="curveHoverPoint.x"
                :x2="curveHoverPoint.x"
                :y1="CURVE_PAD.t"
                :y2="CURVE_H - CURVE_PAD.b"
                class="curve-cross"
              />
              <line
                :x1="CURVE_PAD.l"
                :x2="CURVE_W - CURVE_PAD.r"
                :y1="curveHoverPoint.y"
                :y2="curveHoverPoint.y"
                class="curve-cross"
              />
              <circle
                :cx="curveHoverPoint.x"
                :cy="curveHoverPoint.y"
                r="4"
                class="curve-hover-dot"
              />
            </template>
          </template>
        </svg>
        <div class="curve-tip" :class="{ muted: !curveHoverPoint }">
          <template v-if="curveHoverPoint">
            {{ fmtCurveTs(curveHoverPoint.ts) }} ·
            <b>{{ curveHoverPoint.label }}</b>
          </template>
          <template v-else>
            悬浮查看时间与取值 · 共 {{ curveRows.length }} 个变化点
          </template>
        </div>
      </template>
    </NModal>

    <NModal
      v-model:show="showRun"
      preset="card"
      :title="`执行 ${runDeviceId} / ${runActionName}`"
      style="width: 560px"
    >
      <NSpace vertical>
        <span style="font-size: 12px; color: #5c6874">
          将作为单点设备动作任务提交给 Workflow Authority 统一执行（参与排队、设备与物料锁定），
          可在「实验流程 → 运行」中跟踪。
        </span>
        <NAlert v-if="!conn.schedulerLocal" type="warning" :bordered="false">
          当前连接的进程不持有调度权威（scheduler=remote），无法从这里提交动作。
        </NAlert>
        <ActionParamFields
          :form="runForm"
          empty-text="该动作没有可识别的参数字段，可在下方高级 JSON 中直接填写。"
        />
        <details class="advanced-json">
          <summary>高级：直接编辑参数 JSON</summary>
          <NInput
            v-model:value="runParamJson"
            type="textarea"
            :rows="8"
            placeholder="动作参数 JSON"
            style="font-family: var(--font-mono); font-size: 12px; margin-top: 8px"
          />
        </details>
        <NSpace justify="end">
          <NButton @click="showRun = false">取消</NButton>
          <NButton type="primary" :loading="submitting" @click="submitRun">
            提交
          </NButton>
        </NSpace>
      </NSpace>
    </NModal>
  </div>
</template>

<style scoped>
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

.device-card {
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.device-card:hover {
  border-color: #c9c6bf;
}

.device-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px 14px;
}

.device-glyph {
  width: 54px;
  height: 54px;
  border-radius: 13px;
  background: #fafaf8;
  border: 1px solid #efede8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.device-titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.device-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #16212d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-sub {
  font-size: 12px;
  color: #5c6874;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-led {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #04aa65;
  box-shadow: 0 0 0 0 rgba(4, 170, 101, 0.5);
  animation: led-pulse 2.4s ease-out infinite;
}

@keyframes led-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(4, 170, 101, 0.45);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(4, 170, 101, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(4, 170, 101, 0);
  }
}

.led-text {
  font-size: 12px;
  font-weight: 600;
  color: #03793f;
}

.device-led.off .led {
  background: #b8bec6;
  animation: none;
}

.device-led.off .led-text {
  color: #6e7580;
}

.device-card.offline {
  background: #fbfbf9;
}

.device-card.offline .device-name,
.device-card.offline .device-glyph {
  opacity: 0.7;
}

.action-id {
  font-size: 11px;
  color: #8b929c;
}

.free-chip {
  font-size: 10.5px;
  font-weight: 700;
  color: #0b7a55;
  background: #e6f7f0;
  border-radius: 999px;
  padding: 1px 7px;
}

/* 实时状态条 */
.device-live {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 14px 10px;
  padding: 8px 10px;
  border: 1px solid #e7ecf3;
  border-radius: 10px;
  background: #f7fafd;
  cursor: pointer;
  transition: border-color 0.15s;
}

.device-live:hover {
  border-color: #b9cdf3;
}

.live-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e3e9f1;
  font-size: 11px;
  color: #3c4a5a;
  max-width: 100%;
}

.live-dot,
.prop-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c6ccd4;
  flex-shrink: 0;
}

.live-chip.fresh .live-dot,
.prop-dot.on,
.live-dot.on {
  background: #04aa65;
  box-shadow: 0 0 0 3px rgba(4, 170, 101, 0.14);
}

/* 已收藏属性：金色星标 + 淡黄底，与总览「收藏指标」一致 */
.live-chip.pinned {
  border-color: #f2d27a;
  background: #fffbea;
}

.live-star {
  color: #d99a06;
}

.live-name {
  color: #7a8694;
}

.live-value {
  font-weight: 700;
  font-family: var(--font-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}

.live-more {
  margin-left: auto;
  color: #2e5bff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

/* 属性抽屉 */
.live-legend {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7a8694;
  font-size: 11px;
}

.prop-row {
  padding: 9px 2px;
  border-bottom: 1px solid #f0f1f3;
}

.prop-row.clickable {
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.12s ease;
}

.prop-row.clickable:hover {
  background: #f4f7fd;
}

.prop-curve-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: #5c6874;
  opacity: 0.35;
  transition: opacity 0.12s ease;
}

.prop-row.clickable:hover .prop-curve-icon {
  opacity: 1;
}

/* 收藏星标：已收藏金色常显，未收藏 hover 行时显示 */
.prop-pin {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  padding: 0;
  color: #b3bac2;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
}

.prop-row:hover .prop-pin {
  opacity: 1;
}

.prop-pin:hover {
  color: #f59e0b;
}

.prop-pin.pinned {
  opacity: 1;
  color: #f59e0b;
}

.prop-main {
  display: flex;
  align-items: center;
  gap: 9px;
}

.prop-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.prop-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #26303b;
}

.prop-name small {
  margin-left: 6px;
  color: #9aa3ab;
  font: 10px var(--font-mono);
  font-weight: 400;
}

.prop-time {
  font-size: 10.5px;
  color: #9aa3ab;
}

.prop-value {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: #16212d;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prop-spark {
  width: 120px;
  height: 26px;
  margin: 6px 0 0 15px;
  display: block;
}

.device-actions {
  padding: 4px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions-note {
  padding: 14px 6px;
  font-size: 12px;
  color: #9aa3ab;
}

/* 内嵌面板：动作行（暖纸底 + 细线） */
.action-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fafaf8;
  border: 1px solid #efede8;
  border-radius: 10px;
  padding: 9px 12px;
  transition: border-color 0.15s ease;
}

.action-panel:hover {
  border-color: #c9c6bf;
}

.action-panel.busy {
  background: #fcf1e1;
  border-color: #f0dcbc;
}

.action-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.action-name {
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: #16212d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.busy-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: #b07306;
  flex-shrink: 0;
}

.busy-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f09d20;
  animation: led-pulse-amber 1.6s ease-out infinite;
}

@keyframes led-pulse-amber {
  0% {
    box-shadow: 0 0 0 0 rgba(240, 157, 32, 0.5);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(240, 157, 32, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(240, 157, 32, 0);
  }
}

.run-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #101418;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.run-btn:hover:not(:disabled) {
  background: #2e5bff;
}

.run-btn:disabled {
  background: #c9c6bf;
  cursor: not-allowed;
}

/* 单点动作弹窗：高级 JSON 折叠区 */
.advanced-json {
  color: #7d848e;
  font-size: 11px;
}

.advanced-json summary {
  cursor: pointer;
  user-select: none;
}

/* 属性历史曲线放大视图 */
.curve-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.curve-ranges {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid #e8e6e1;
  border-radius: 9px;
  background: #fafaf8;
}

.range-btn {
  border: none;
  background: transparent;
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 12px;
  color: #5c6874;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.range-btn:hover {
  color: #16212d;
}

.range-btn.active {
  background: #101418;
  color: #fff;
  font-weight: 600;
}

.curve-kind {
  font-size: 11px;
  color: #9aa3ab;
}

.curve-svg {
  width: 100%;
  height: auto;
  display: block;
  border: 1px solid #eceae5;
  border-radius: 10px;
  background: #fdfdfc;
}

.curve-grid {
  stroke: #eef0f3;
  stroke-width: 1;
}

.curve-label {
  font-size: 10px;
  fill: #9aa3ab;
  font-family: var(--font-mono);
}

.curve-label.y {
  text-anchor: end;
}

.curve-label.x {
  text-anchor: middle;
}

.curve-path {
  fill: none;
  stroke: #2e5bff;
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.curve-dot {
  fill: #2e5bff;
  opacity: 0.75;
}

.curve-cross {
  stroke: #c2452d;
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.7;
}

.curve-hover-dot {
  fill: #fff;
  stroke: #c2452d;
  stroke-width: 2;
}

.curve-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #26303b;
  font-family: var(--font-mono);
  min-height: 18px;
}

.curve-tip.muted {
  color: #9aa3ab;
  font-family: inherit;
}
</style>
