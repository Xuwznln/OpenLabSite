/** 实验室概览：根设备 + 未占位的子台面；已上位点的物料以占用者表示，不冒充根设备。 */
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

export interface MaterialSurface {
  uuid: string;
  name: string;
  transform: string;
  nested: boolean;
  w: number;
  h: number;
  sites: MapSite[];
}

export interface MaterialMapRoot {
  aggregate: MaterialsV1Aggregate;
  w: number;
  h: number;
  surfaces: MaterialSurface[];
  sites: MapSite[];
  childCount: number;
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

export function materialMap(aggregates: MaterialsV1Aggregate[]): MaterialMapRoot[] {
  const byUuid = new Map(aggregates.map((item) => [item.material.material_uuid, item]));
  const children = new Map<string, MaterialsV1Aggregate[]>();
  for (const item of aggregates) {
    const parent = item.material.parent_material_uuid;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  for (const list of children.values()) list.sort((a, b) => a.material.ordinal - b.material.ordinal);
  return aggregates.filter((item) => !item.material.parent_material_uuid && item.material.resource_type !== "well")
    .map((aggregate) => {
      const w = Math.max(60, dimension(aggregate.position.size_width, 320));
      const h = Math.max(60, dimension(aggregate.position.size_height, 240));
      const surfaces: MaterialSurface[] = [];
      const seen = new Set<string>();
      const visit = (item: MaterialsV1Aggregate, parentTransform: string, nested: boolean) => {
        const uuid = item.material.material_uuid;
        if (seen.has(uuid) || item.material.resource_type === "well") return;
        seen.add(uuid);
        const p = item.position;
        const transform = nested
          ? `${parentTransform} translate(${finiteNumber(p.position_x, 0)} ${finiteNumber(p.position_y, 0)}) rotate(${finiteNumber(p.rotation_z, 0)})`
          : "";
        const sw = nested ? dimension(p.size_width, 120) : w;
        const sh = nested ? dimension(p.size_height, 90) : h;
        surfaces.push({ uuid, name: item.material.display_name || item.material.name, transform,
          nested, w: sw, h: sh, sites: mapSites(item, byUuid, sw, sh) });
        // 位点内的板/枪头盒及其孔位在装配视图下钻，概览不重复覆盖占用标签。
        const occupied = new Set(item.sites.map((site) => site.occupied_material_uuid));
        for (const child of children.get(uuid) ?? []) {
          if (!occupied.has(child.material.material_uuid)) visit(child, transform, true);
        }
      };
      visit(aggregate, "", false);
      return { aggregate, w, h, surfaces, sites: surfaces.flatMap((s) => s.sites),
        childCount: children.get(aggregate.material.material_uuid)?.length ?? 0 };
    });
}
