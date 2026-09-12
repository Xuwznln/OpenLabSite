/** 物料投影回归的最小权威聚合，测试按场景补充层级、尺寸与位点。 */
import type { MaterialsV1Aggregate, MaterialsV1Site } from "@openlab/protocol";

export function materialFixture(uuid: string, type = "device", parent: string | null = null): MaterialsV1Aggregate {
  return {
    material: { material_uuid: uuid, resource_id: uuid, name: uuid, display_name: uuid,
      parent_material_uuid: parent, resource_type: type, template_name: type, template_uuid: `template-${type}`,
      class_name: type, config: {}, resource_schema: {}, model: {}, extra: {}, meta_data: {},
      description: "", machine_name: "", barcode: "", barcode_symbology: "", icon_uri: "",
      lifecycle_status: "active", ordinal: 0, created_at_ms: 0, updated_at_ms: 0, version: 1 },
    position: { size_width: 400, size_height: 320, size_depth: 0, position_x: 0, position_y: 0,
      position_z: 0, position3d_x: 0, position3d_y: 0, position3d_z: 0, scale_x: 1, scale_y: 1, scale_z: 1,
      rotation_x: 0, rotation_y: 0, rotation_z: 0, cross_section_type: "rectangle", layout: "x-y", extra: {} },
    position_version: 1,
    data: { data: {}, substances: [], sites_initialized: true, state_status: "created",
      observed_at_ms: 0, content_version: 1, state_hash: "data", updated_at_ms: 0, version: 1 },
    sites: [], state_hash: "aggregate",
  };
}

export function siteFixture(owner: string, label: string, occupant: string | null = null): MaterialsV1Site {
  return { site_uuid: `${owner}-${label}`, owner_material_uuid: owner, schema_version: 1,
    template_name: owner, site_index: label, label, visible: true, occupied_material_uuid: occupant,
    pose: { position: { x: 40, y: 60 }, size: { width: 120, height: 80 } },
    allowed_resource_categories: [], parent_link: "", description: "", extra: {}, meta_data: {},
    ordinal: 0, changed_at_ms: 0, created_at_ms: 0, updated_at_ms: 0, version: 1 };
}
