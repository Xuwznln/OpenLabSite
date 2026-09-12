import type { MaterialsV1Aggregate, MaterialsV1Tree } from "@openlab/protocol";
import { finiteNumber, mapSites, type MapSite } from "./material-map";

export interface AssemblyNode {
  edge_uuid: string;
  template_id: string;
  template_name: string;
  category: string;
  spec: { volume_ml?: number };
  barcode?: string;
  status: string;
  slot_id: string;
  content: { substance?: string; volume_ml?: number };
  geometry: { x: number; y: number; z: number; w: number; d: number; h: number };
  emptySites: MapSite[];
  children: AssemblyNode[];
}

export interface LabAssembly { root: AssemblyNode }

const HEIGHTS: Record<string, number> = { device: 10, deck: 10, rack: 30, tip_rack: 30, plate: 10, tube: 26, bottle: 44 };
const positive = (value: unknown, fallback: number) => Math.max(0, finiteNumber(value, 0)) || fallback;

/** 按权威 parent/位点占用建树；挂在设备下的空台面也必须有独立几何与空位点。 */
export function assemblyFromMaterials(tree: MaterialsV1Tree): LabAssembly {
  const byUuid = new Map(tree.nodes.map((item) => [item.material.material_uuid, item]));
  const children = new Map<string, MaterialsV1Aggregate[]>();
  for (const item of tree.nodes) {
    const parent = item.material.parent_material_uuid;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  const visited = new Set<string>();
  const toNode = (item: MaterialsV1Aggregate, parentSites: MapSite[] = []): AssemblyNode => {
    const identity = item.material;
    if (visited.has(identity.material_uuid)) throw new Error(`物料树存在环或重复节点：${identity.material_uuid}`);
    visited.add(identity.material_uuid);
    const parentSite = parentSites.find((s) => s.site.occupied_material_uuid === identity.material_uuid);
    const p = item.position;
    const w = positive(p.size_width, parentSite?.w ?? 120);
    const d = positive(p.size_height, parentSite?.h ?? 90);
    const sites = mapSites(item, byUuid, w, d);
    const substance = item.data.substances[0];
    const explicitVolume = typeof item.data.data.volume_ml === "number" ? item.data.data.volume_ml : undefined;
    return {
      edge_uuid: identity.material_uuid, template_id: identity.template_uuid,
      template_name: identity.display_name || identity.name || identity.template_name,
      category: identity.resource_type, barcode: identity.barcode, status: identity.lifecycle_status,
      slot_id: parentSite?.site.label || "", spec: { volume_ml: explicitVolume },
      content: { substance: substance?.name, volume_ml: explicitVolume ??
        (substance?.quantity_unit.toLowerCase() === "ml" ? substance.quantity : undefined) },
      geometry: {
        // 位点是当前落位事实：move 可只更新关系，不必等待设备补上位置快照。
        x: parentSite?.x ?? finiteNumber(p.position_x, 0),
        y: parentSite?.y ?? finiteNumber(p.position_y, 0), z: finiteNumber(p.position_z, 0),
        w, d, h: positive(p.size_depth, HEIGHTS[identity.resource_type] ?? 18),
      },
      emptySites: sites.filter((s) => !s.site.occupied_material_uuid),
      children: (children.get(identity.material_uuid) ?? []).map((child) => toNode(child, sites)),
    };
  };
  const root = byUuid.get(tree.root_material_uuid);
  if (!root) throw new Error(`materials.v1 tree 缺少根物料 ${tree.root_material_uuid}`);
  return { root: toNode(root) };
}

export function findAssemblyNode(root: AssemblyNode, uuid: string): AssemblyNode | undefined {
  if (root.edge_uuid === uuid) return root;
  for (const child of root.children) {
    const found = findAssemblyNode(child, uuid);
    if (found) return found;
  }
  return undefined;
}
