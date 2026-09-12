/**
 * 实体解析：uuid / id → 名称、类型、描述、状态、层级路径、跳转路由。
 *
 * 全局 UUID 展示统一走「名称 + hover 详情」（EntityRef 组件）。本 store 负责：
 * - 把 materials.v1 的物料 / 库位 / 模板 / 批次一次性建成内存索引；
 * - 从变更账本的 create 记录里保留已删除物料的 resource_id，删除后仍能叫出名字；
 * - 工作流 / 任务 / 作业 / 设备直接从各自的 store 现场解析，不重复拉取。
 * 数据真相仍是 HTTP；索引定期或按失效通知重建。
 */

import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { describeNodeJob, describeTask } from "../features/task-jobs";
import { createRefreshQueue } from "../features/refresh-queue";
import { useConnectionStore } from "./connection";
import { useDevicesStore } from "./devices";
import { useSchedulerStore } from "./scheduler";

export type EntityKind = "material" | "site" | "template" | "lot" | "workflow" | "task" | "job" | "device";

export interface EntityInfo {
  uuid: string;
  name: string;
  kind: EntityKind;
  /** 分类：模板 category 或资源类型。 */
  category?: string;
  templateName?: string;
  /** 层级上游：material 用 parent_material_uuid；site 用 owner_material_uuid；job 用 task。 */
  parentUuid?: string;
  resourceId?: string;
  description?: string;
  /** 生命周期 / 任务状态等一句话状态。 */
  status?: string;
  /** 已从权威删除（只剩账本里的记录）。 */
  deleted?: boolean;
  /** 可跳转的页面。 */
  route?: string;
}

const KIND_LABELS: Record<EntityKind, string> = {
  material: "物料",
  site: "位点",
  template: "模板",
  lot: "批次",
  workflow: "流程",
  task: "任务",
  job: "作业",
  device: "设备",
};

export function entityKindLabel(kind: EntityKind): string {
  return KIND_LABELS[kind];
}

export const useEntityCacheStore = defineStore("entity-cache", () => {
  const conn = useConnectionStore();
  const sched = useSchedulerStore();
  const devices = useDevicesStore();

  const byUuid = shallowRef<Map<string, EntityInfo>>(new Map());
  /** 账本里出现过、但当前实例列表里已不存在的物料（resource_id 来自 create 记录）。 */
  const tombstones = shallowRef<Map<string, EntityInfo>>(new Map());
  const loadedAt = ref(0);

  const refresh = createRefreshQueue(async () => {
    if (!conn.online) return;
    try {
      const api = conn.api.domains.materialsV1;
      const [aggregates, templates, lots, changes] = await Promise.all([
        api.instances(),
        api.templates({ includeDefinition: false }).catch(() => []),
        api.lots().catch(() => []),
        api.changes(0, 500).catch(() => []),
      ]);
      if (api !== conn.api.domains.materialsV1) return;
      const next = new Map<string, EntityInfo>();
      const templateName = new Map(templates.map((item) => [item.template_uuid, item.display_name || item.name]));
      for (const template of templates) {
        next.set(template.template_uuid, {
          uuid: template.template_uuid,
          name: template.display_name || template.name,
          kind: "template",
          category: [template.resource_type, ...template.category].filter(Boolean).join(" · "),
          resourceId: template.name,
          status: template.status === "active" ? undefined : template.status,
        });
      }
      for (const aggregate of aggregates) {
        const material = aggregate.material;
        if (material.template_uuid && !next.has(material.template_uuid)) {
          next.set(material.template_uuid, {
            uuid: material.template_uuid,
            name: material.template_name || material.class_name,
            kind: "template",
            category: material.resource_type,
          });
        }
        next.set(material.material_uuid, {
          uuid: material.material_uuid,
          name: material.display_name || material.name,
          kind: "material",
          category: material.resource_type,
          templateName: templateName.get(material.template_uuid) ?? material.template_name,
          parentUuid: material.parent_material_uuid ?? undefined,
          resourceId: material.resource_id,
          description: material.description || undefined,
          status: material.lifecycle_status,
          route: material.resource_type === "device" ? "/devices" : `/inventory?material=${encodeURIComponent(material.material_uuid)}`,
        });
        for (const site of aggregate.sites) {
          next.set(site.site_uuid, {
            uuid: site.site_uuid,
            name: site.label || `位点 ${site.site_index}`,
            kind: "site",
            templateName: site.template_name,
            parentUuid: site.owner_material_uuid,
            status: site.occupied_material_uuid ? "已占用" : "空",
          });
        }
      }
      for (const lot of lots) {
        next.set(lot.lot_uuid, {
          uuid: lot.lot_uuid,
          name: lot.batch_no ? `批次 ${lot.batch_no}` : `批次 ${lot.lot_uuid.slice(0, 8)}`,
          kind: "lot",
          templateName: templateName.get(lot.template_uuid),
          parentUuid: lot.template_uuid,
          status: `${lot.quantity_available} / ${lot.quantity_total} ${lot.unit}${lot.quarantined ? " · 隔离" : ""}`,
          route: "/inventory",
        });
      }
      // 已删除物料：只剩账本，用 create 记录里的 resource_id 叫名字
      const stones = new Map<string, EntityInfo>();
      for (const change of changes) {
        if (change.aggregate_type !== "material" || change.operation !== "create" || next.has(change.aggregate_uuid)) continue;
        const delta = (change.delta ?? {}) as Record<string, unknown>;
        const resourceId = typeof delta.resource_id === "string" ? delta.resource_id : "";
        stones.set(change.aggregate_uuid, {
          uuid: change.aggregate_uuid,
          name: resourceId || change.aggregate_uuid.slice(0, 8),
          kind: "material",
          resourceId: resourceId || undefined,
          deleted: true,
          status: "已删除",
        });
      }
      byUuid.value = next;
      tombstones.value = stones;
      loadedAt.value = Date.now();
    } catch {
      /* 仓储能力不可用时保持现有索引；EntityRef 以短码兜底。 */
    }
  });

  /** 工作流 / 任务 / 作业 / 设备：从各自 store 现场解析，随其轮询自然更新。 */
  function resolveLive(uuid: string): EntityInfo | undefined {
    const workflow = sched.definitions.find((item) => item.uuid === uuid);
    if (workflow) {
      return {
        uuid,
        name: workflow.name,
        kind: "workflow",
        description: workflow.description || undefined,
        status: `版本 ${workflow.revision}`,
        category: workflow.tags.map(String).join(" · ") || undefined,
        route: `/workflows/${encodeURIComponent(uuid)}`,
      };
    }
    const task = sched.tasks.find((item) => item.uuid === uuid);
    if (task) {
      return {
        uuid,
        name: describeTask(task),
        kind: "task",
        description: task.description || undefined,
        status: task.status,
        parentUuid: task.workflow_uuid ?? undefined,
        route: `/workflow-tasks/${encodeURIComponent(uuid)}`,
      };
    }
    for (const [taskUuid, jobs] of Object.entries(sched.jobsByTask)) {
      const job = jobs.find((item) => item.uuid === uuid);
      if (!job) continue;
      const owner = sched.tasks.find((item) => item.uuid === taskUuid) ?? null;
      const info = describeNodeJob(owner, job);
      return {
        uuid,
          name: `${info.nodeName} · attempt ${job.attempt_no}`,
        kind: "job",
        category: info.deviceId ? `${info.deviceId} · ${info.actionName}` : info.actionName,
        status: job.status,
        parentUuid: taskUuid,
        route: `/workflow-tasks/${encodeURIComponent(taskUuid)}`,
      };
    }
    const device = devices.byId(uuid);
    if (device) {
      return {
        uuid,
        name: device.displayName,
        kind: "device",
        category: device.className || undefined,
        resourceId: device.id,
        status: device.busyActions ? "执行中" : device.online ? "在线" : "离线",
        route: "/devices",
      };
    }
    return undefined;
  }

  function resolve(uuid: string): EntityInfo | undefined {
    return byUuid.value.get(uuid) ?? resolveLive(uuid) ?? tombstones.value.get(uuid);
  }

  /** 层级路径（根 → … → 自身）的名称序列；带防环上限。 */
  function pathOf(uuid: string): string[] {
    const names: string[] = [];
    let current = resolve(uuid);
    let guard = 0;
    while (current && guard < 12) {
      names.unshift(current.name);
      current = current.parentUuid ? resolve(current.parentUuid) : undefined;
      guard += 1;
    }
    return names;
  }

  const size = computed(() => byUuid.value.size);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startPolling(intervalMs = 15000) {
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
      byUuid.value = new Map();
      tombstones.value = new Map();
      loadedAt.value = 0;
      void refresh();
    },
  );

  // 后端恢复在线后尽快建立索引
  watch(
    () => conn.online,
    (online) => {
      if (online && !loadedAt.value) void refresh();
    },
  );

  // 物料失效通知（SSE）到达时立即重建索引，无需等下一轮轮询
  watch(
    () => conn.materialsNoticeRevision,
    () => void refresh(),
  );

  return { byUuid, size, loadedAt, refresh, resolve, pathOf, startPolling, stopPolling };
});
