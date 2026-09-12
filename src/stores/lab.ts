/**
 * 实验室铭牌：本地保存的实验室名称与备注（微后端没有实验室配置 API，
 * 铭牌只用于界面标识）。缺省名称由 HostLink host_id 推导。
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useConnectionStore } from "./connection";

const STORAGE_KEY = "openlab:lab-profile";

export interface LabProfile {
  name: string;
  location: string;
  note: string;
}

function load(): LabProfile {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      name: typeof raw?.name === "string" ? raw.name : "",
      location: typeof raw?.location === "string" ? raw.location : "",
      note: typeof raw?.note === "string" ? raw.note : "",
    };
  } catch {
    return { name: "", location: "", note: "" };
  }
}

export const useLabStore = defineStore("lab", () => {
  const conn = useConnectionStore();
  const profile = ref<LabProfile>(load());
  const hostId = ref("");

  const displayName = computed(
    () => profile.value.name.trim() || (hostId.value ? `实验室 · ${hostId.value}` : "本地实验室"),
  );

  function update(patch: Partial<LabProfile>) {
    profile.value = { ...profile.value, ...patch };
  }

  async function refreshHostIdentity() {
    if (!conn.online) return;
    try {
      const status = await conn.api.domains.system.hostlinkPeers();
      hostId.value = status.host_id ?? status.host_node_id ?? "";
    } catch {
      /* 诊断路由不可用时保留上次值 */
    }
  }

  watch(
    profile,
    (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
    { deep: true },
  );

  watch(
    () => conn.online,
    (online) => {
      if (online) void refreshHostIdentity();
    },
    { immediate: true },
  );

  return { profile, hostId, displayName, update, refreshHostIdentity };
});
