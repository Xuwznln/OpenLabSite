/** 物料位点几何：按 pose 摆放位点并标出占用者（装配视图用）。 */
import type { MaterialsV1Aggregate, MaterialsV1Site } from "@openlab/protocol";

export interface MapSite {
  key: string;
  ownerName: string;
  site: MaterialsV1Site;
  x: number;
  y: number;
  w: number;
  h: number;
  occupant?: MaterialsV1Aggregate;
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dimension(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function poseValue(pose: Record<string, unknown>, group: string, axis: string): number | undefined {
  const part = pose[group];
  if (!part || typeof part !== "object") return undefined;
  const value = (part as Record<string, unknown>)[axis];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 位点几何以 pose 为准；没有 pose 时才自动排列，绝不把 T1 误解为第 20 行。 */
export function mapSites(item: MaterialsV1Aggregate, byUuid: Map<string, MaterialsV1Aggregate>, w: number, h: number): MapSite[] {
  return item.sites.filter((site) => site.visible !== false).map((site, index) => {
    const pose = site.pose ?? {};
    const sw = dimension(poseValue(pose, "size", "width"), Math.min(w, 80) * 0.8);
    const sh = dimension(poseValue(pose, "size", "height"), Math.min(h, 80) * 0.8);
    const cols = Math.max(1, Math.floor(w / (sw + 10)));
    return {
      key: `${item.material.material_uuid}:${site.site_uuid}`,
      ownerName: item.material.display_name || item.material.name,
      site,
      x: poseValue(pose, "position", "x") ?? 10 + (index % cols) * (sw + 10),
      y: poseValue(pose, "position", "y") ?? 10 + Math.floor(index / cols) * (sh + 10),
      w: sw,
      h: sh,
      occupant: site.occupied_material_uuid ? byUuid.get(site.occupied_material_uuid) : undefined,
    };
  });
}
