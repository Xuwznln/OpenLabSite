/**
 * 设备目录：把微后端四处分散的设备事实合成一份浏览器视图。
 *
 * - runtime.v1 `endpoints`：谁在执行哪些设备（device_routes）、每个动作的
 *   registry 定义与当前可用性（action_capabilities）——动作目录的权威；
 * - materials.v1 根物料（resource_type=device）：展示名、registry 类名、位点、
 *   台面位置；
 * - telemetry.v1 `states`：最新属性快照；
 * - system `hostlink/peers`：Slave 机器与在线判定。
 *
 * 数据真相始终是 HTTP；本 store 只做合并与轮询，失效通知到达时立即重拉。
 */

import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import type {
  HostLinkPeer,
  HostLinkStatus,
  MaterialsV1Aggregate,
  MaterialsV1Position,
  MaterialsV1Site,
  RuntimeActionCapability,
  RuntimeExecutorEndpoint,
  TelemetryV1DeviceState,
} from "@openlab/protocol";
import { useConnectionStore } from "./connection";
import { createRefreshQueue } from "../features/refresh-queue";

export interface DeviceRecord {
  /** 设备 id（runtime device_uuid == materials resource_id）。 */
  id: string;
  displayName: string;
  className: string;
  materialUuid?: string;
  endpointUuid?: string;
  transport?: RuntimeExecutorEndpoint["transport"];
  machineName: string;
  /** host = Host 进程本地设备；slave = 经 HostLink 接入的远端设备。 */
  origin: "host" | "slave" | "unknown";
  online: boolean;
  isHostNode: boolean;
  actions: RuntimeActionCapability[];
  busyActions: number;
  telemetry?: TelemetryV1DeviceState;
  sites: MaterialsV1Site[];
  position?: MaterialsV1Position;
  aggregate?: MaterialsV1Aggregate;
  peer?: HostLinkPeer;
}

export function isHostNodeId(id: string): boolean {
  return id === "host_node" || id.startsWith("host_node_");
}

export const useDevicesStore = defineStore("devices", () => {
  const conn = useConnectionStore();

  const endpoints = shallowRef<RuntimeExecutorEndpoint[]>([]);
  const roots = shallowRef<MaterialsV1Aggregate[]>([]);
  const telemetry = shallowRef<TelemetryV1DeviceState[]>([]);
  const hostlink = shallowRef<HostLinkStatus | null>(null);
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref("");
  const lastRefreshedAt = ref(0);

  const devices = computed<DeviceRecord[]>(() => {
    const byId = new Map<string, DeviceRecord>();
    const ensure = (id: string): DeviceRecord => {
      let record = byId.get(id);
      if (!record) {
        record = {
          id,
          displayName: id,
          className: "",
          machineName: "",
          origin: "unknown",
          online: false,
          isHostNode: isHostNodeId(id),
          actions: [],
          busyActions: 0,
          sites: [],
        };
        byId.set(id, record);
      }
      return record;
    };

    const peers = hostlink.value?.peers ?? [];
    const slaveDevices = new Map<string, HostLinkPeer>();
    for (const peer of peers) {
      for (const id of peer.device_ids ?? Object.keys(peer.devices ?? {})) {
        slaveDevices.set(id, peer);
      }
    }
    const hostMachine = hostlink.value?.host_id ?? "";

    for (const endpoint of endpoints.value) {
      const endpointOnline = endpoint.state === "online";
      for (const route of endpoint.device_routes) {
        const record = ensure(route.device_uuid);
        record.endpointUuid = endpoint.endpoint_uuid;
        record.transport = endpoint.transport;
        const routeConfig = route.config ?? {};
        if (routeConfig.is_host_node === true || routeConfig.registry_name === "host_node") {
          record.isHostNode = true;
        }
        record.online = record.online || (endpointOnline && route.enabled && route.selected);
        if (!record.className) record.className = route.driver_key === route.device_uuid ? "" : route.driver_key;
      }
      for (const capability of endpoint.action_capabilities) {
        if (capability.state !== "active") continue;
        const record = ensure(capability.device_uuid);
        record.actions.push(capability);
        if (capability.availability === "busy") record.busyActions += 1;
      }
    }

    for (const aggregate of roots.value) {
      const material = aggregate.material;
      if (material.resource_type !== "device") continue;
      const record = ensure(material.resource_id);
      record.displayName = material.display_name || material.name || record.id;
      record.className = material.class_name || record.className;
      record.materialUuid = material.material_uuid;
      record.machineName = material.machine_name || record.machineName;
      record.sites = aggregate.sites;
      record.position = aggregate.position;
      record.aggregate = aggregate;
    }

    for (const state of telemetry.value) {
      const record = ensure(state.device_uuid);
      record.telemetry = state;
    }

    for (const record of byId.values()) {
      const peer = slaveDevices.get(record.id);
      if (peer) {
        record.origin = "slave";
        record.peer = peer;
        record.machineName = record.machineName || peer.machine_name;
        record.online = record.online || peer.online;
        const profile = peer.devices?.[record.id];
        if (profile) {
          if (record.displayName === record.id && profile.display_name) record.displayName = profile.display_name;
          if (!record.className) record.className = profile.registry_name;
          // endpoint 能力快照的 descriptor 不带展示名；Slave 档案的 action_value_mappings 有，补进去。
          record.actions = record.actions.map((capability) => {
            const mapping = profile.action_value_mappings?.[capability.action_name];
            const displayName =
              mapping && typeof mapping === "object" && !Array.isArray(mapping)
                ? (mapping as Record<string, unknown>).display_name
                : undefined;
            if (typeof displayName !== "string" || !displayName.trim() || capability.descriptor.display_name) {
              return capability;
            }
            return { ...capability, descriptor: { ...capability.descriptor, display_name: displayName } };
          });
        }
      } else if (record.endpointUuid || record.materialUuid) {
        record.origin = "host";
        record.machineName = record.machineName || hostMachine;
      }
      record.actions.sort((a, b) => a.action_name.localeCompare(b.action_name));
    }

    return [...byId.values()].sort((a, b) => {
      if (a.isHostNode !== b.isHostNode) return a.isHostNode ? 1 : -1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, "zh-CN");
    });
  });

  /** 不含 host_node 的业务设备。 */
  const instruments = computed(() => devices.value.filter((device) => !device.isHostNode));
  const onlineCount = computed(() => instruments.value.filter((device) => device.online).length);
  const actionCount = computed(() =>
    instruments.value.reduce((total, device) => total + device.actions.length, 0),
  );
  const busyCount = computed(() => instruments.value.filter((device) => device.busyActions > 0).length);

  function byId(id: string): DeviceRecord | undefined {
    return devices.value.find((device) => device.id === id);
  }

  const refresh = createRefreshQueue(async () => {
    if (!conn.online) return;
    loading.value = true;
    const api = conn.api.domains;
    const [endpointResult, rootsResult, telemetryResult, hostlinkResult] = await Promise.allSettled([
      api.runtimeV1.endpoints({ limit: 200 }),
      api.materialsV1.instances(true),
      api.telemetryV1.states(),
      api.system.hostlinkPeers(),
    ]);
    if (api !== conn.api.domains) {
      loading.value = false;
      return;
    }
    const failures: string[] = [];
    if (endpointResult.status === "fulfilled") endpoints.value = endpointResult.value;
    else failures.push(`runtime: ${String(endpointResult.reason?.message ?? endpointResult.reason)}`);
    if (rootsResult.status === "fulfilled") roots.value = rootsResult.value;
    else failures.push(`materials: ${String(rootsResult.reason?.message ?? rootsResult.reason)}`);
    if (telemetryResult.status === "fulfilled") telemetry.value = telemetryResult.value;
    if (hostlinkResult.status === "fulfilled") hostlink.value = hostlinkResult.value;
    error.value = failures.join("；");
    loaded.value = true;
    lastRefreshedAt.value = Date.now();
    loading.value = false;
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(intervalMs = 5000) {
    if (pollTimer !== null) return;
    void refresh();
    pollTimer = setInterval(() => void refresh(), intervalMs);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  watch(
    () => conn.baseUrl,
    () => {
      endpoints.value = [];
      roots.value = [];
      telemetry.value = [];
      hostlink.value = null;
      loaded.value = false;
      error.value = "";
      lastRefreshedAt.value = 0;
      void refresh();
    },
  );
  watch(
    () => conn.online,
    (online) => {
      if (online) void refresh();
    },
  );
  watch(
    () => conn.materialsNoticeRevision,
    () => void refresh(),
  );

  return {
    endpoints,
    roots,
    telemetry,
    hostlink,
    devices,
    instruments,
    onlineCount,
    actionCount,
    busyCount,
    loading,
    loaded,
    error,
    lastRefreshedAt,
    byId,
    refresh,
    startPolling,
    stopPolling,
  };
});
