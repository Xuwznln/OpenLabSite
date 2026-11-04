/** SiteSlot 绑定：候选匹配不等于确认；与微后端导入边界共享作用域规则。 */
import type { MaterialsV1Aggregate } from "@openlab/protocol";

export interface SiteBinding {
  site_uuid: string;
  owner_material_uuid: string;
  device_id: string;
  action_name: string;
}
export type SiteBindings = Record<string, SiteBinding>;
export interface SiteCandidate {
  value: string;
  label: string;
  siteLabel: string;
  ownerUuid: string;
  ownerName: string;
}
export interface SiteContext {
  deviceId: string;
  actionName: string;
  param: Record<string, unknown>;
  owners?: Record<string, string>;
}

/** 缺省沿用动作建议，显式空值保留；仅用于展示和校验，不把默认值写回草稿。 */
export function siteParamValue(field: string, param: Record<string, unknown>, defaults?: unknown): unknown {
  if (Object.hasOwn(param, field)) return param[field];
  return defaults && typeof defaults === "object" && !Array.isArray(defaults)
    ? (defaults as Record<string, unknown>)[field] : undefined;
}

export class SiteIndex {
  readonly materials = new Map<string, MaterialsV1Aggregate["material"]>();
  readonly sites: SiteCandidate[] = [];
  constructor(items: readonly MaterialsV1Aggregate[]) {
    for (const { material, sites } of items) {
      if (material.deleted_at_ms != null) continue;
      this.materials.set(material.material_uuid, material);
      for (const site of sites ?? []) {
        if (site.deleted_at_ms != null) continue;
        this.sites.push({ value: site.site_uuid, siteLabel: site.label,
          ownerUuid: material.material_uuid, ownerName: material.display_name || material.name,
          label: `${material.display_name || material.name} · ${site.label}${site.occupied_material_uuid ? "（已占用）" : ""}` });
      }
    }
  }

  contains(root: string, owner: string): boolean {
    const seen = new Set<string>();
    while (owner && !seen.has(owner)) {
      if (owner === root) return true;
      seen.add(owner);
      owner = this.materials.get(owner)?.parent_material_uuid ?? "";
    }
    return false;
  }

  candidates(field: string, context: SiteContext): SiteCandidate[] {
    let owner = context.owners?.[field];
    // mount_resource 是 Host 物料动作已声明的目标父级；其他 ResourceSlot 可能是源物料。
    const mount = context.param.mount_resource;
    if (!owner && mount && (typeof mount !== "object" || Array.isArray(mount))) return [];
    if (!owner && mount && typeof mount === "object" && !Array.isArray(mount) && Object.keys(mount).length) {
      const ref = mount as Record<string, unknown>;
      if (ref.uuid) owner = String(ref.uuid);
      else {
        const label = String(ref.name || ref.id || "");
        const matches = [...this.materials.values()].filter((m) => label && (m.name === label || m.resource_id === label));
        if (matches.length !== 1) return [];
        owner = matches[0].material_uuid;
      }
    }
    if (owner) return this.sites.filter((site) => site.ownerUuid === owner);
    const devices = [...this.materials.values()].filter((m) =>
      m.resource_id === context.deviceId || m.material_uuid === context.deviceId);
    if (devices.length !== 1) return [];
    return this.sites.filter((site) => this.contains(devices[0].material_uuid, site.ownerUuid));
  }
}

export type SiteBindingStatus = "bound" | "unconfirmed" | "unavailable" | "invalid";
export function siteBindingStatus(
  field: string, context: SiteContext, index: SiteIndex | null, binding?: SiteBinding,
): SiteBindingStatus {
  if (!index) return "unavailable";
  const value = context.param[field];
  const site = index.candidates(field, context).find((item) => item.value === value);
  if (!site) return binding ? "invalid" : "unconfirmed";
  return binding && binding.site_uuid === value && binding.owner_material_uuid === site.ownerUuid &&
    binding.device_id === context.deviceId && binding.action_name === context.actionName
    ? "bound" : "unconfirmed";
}

export function confirmSite(field: string, siteUuid: string, context: SiteContext, index: SiteIndex): SiteBinding {
  const site = index.candidates(field, context).find((item) => item.value === siteUuid);
  if (!site) throw new Error("所选 Site 已失效或不属于目标物料，请刷新后重新选择");
  return { site_uuid: site.value, owner_material_uuid: site.ownerUuid,
    device_id: context.deviceId, action_name: context.actionName };
}

/** 仅预选唯一候选；不写参数、不确认，不从全局同名 Site 中选第一个。 */
export function suggestSite(value: unknown, candidates: readonly SiteCandidate[]): SiteCandidate | undefined {
  const matches = candidates.filter((site) => site.value === value || site.siteLabel === value);
  return matches.length === 1 ? matches[0] : undefined;
}
